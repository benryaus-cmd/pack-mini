import test from "node:test";
import assert from "node:assert/strict";
import { initialSave, recycle } from "../src/game/engine.ts";
import {
  prepareTrade,
  completeTrade,
  cancelPreparedTrade,
  tradeDigest,
} from "../src/game/trading.ts";
const a = {
  instanceId: "a1",
  cardId: "base1-4",
  setId: "base1",
  finish: "holo" as const,
  tier: 3,
  obtainedAt: 1,
  openingId: "packA",
};
const b = {
  ...a,
  instanceId: "b1",
  cardId: "neo1-9",
  setId: "neo1",
  openingId: "packB",
};
const terms = {
  id: "12345678901234567890",
  parties: ["a", "b"] as [string, string],
  offers: { a: [a], b: [b] },
};
test("both devices atomically exchange their own cards and replay is harmless", () => {
  const sa = { ...initialSave(), owned: [a] },
    sb = { ...initialSave(), owned: [b] };
  const pa = prepareTrade(sa, terms, "a"),
    pb = prepareTrade(sb, terms, "b");
  assert.throws(() => recycle(pa, ["a1"]), /reserved/);
  const ca = completeTrade(pa, terms, "a"),
    cb = completeTrade(pb, terms, "b");
  assert.equal(ca.owned[0].cardId, b.cardId);
  assert.equal(cb.owned[0].cardId, a.cardId);
  assert.equal(ca.coins, sa.coins);
  assert.deepEqual(completeTrade(ca, terms, "a"), ca);
  assert.deepEqual(sa.owned, [a]);
});
test("reload journals preserve exact terms, reject changes, and release declined reservations", () => {
  const p = prepareTrade({ ...initialSave(), owned: [a] }, terms, "a");
  const reloaded = JSON.parse(JSON.stringify(p));
  assert.equal(tradeDigest(reloaded.trades[0]), tradeDigest(terms));
  assert.throws(
    () => completeTrade(reloaded, { ...terms, offers: { a: [a], b: [] } }, "a"),
    /terms/,
  );
  const cancelled = cancelPreparedTrade(reloaded, terms.id);
  assert.throws(() => completeTrade(cancelled, terms, "a"), /declined/);
});
test("pending openings and unavailable cards cannot be offered", () => {
  assert.throws(() => prepareTrade(initialSave(), terms, "a"), /unavailable/);
  const s = {
    ...initialSave(),
    owned: [a],
    pending: { id: "packA", instances: ["a1"] } as any,
  };
  assert.throws(() => prepareTrade(s, terms, "a"), /unavailable/);
});
test("terminal journals cannot be reconfirmed or revived by delayed packets", () => {
  const p = prepareTrade({ ...initialSave(), owned: [a] }, terms, "a");
  for (const s of [
    cancelPreparedTrade(p, terms.id),
    completeTrade(p, terms, "a"),
  ])
    assert.throws(() => prepareTrade(s, terms, "a"), /already ended/);
});
