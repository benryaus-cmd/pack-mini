import test from "node:test";
import assert from "node:assert/strict";
import { initialSave, recycle } from "../src/game/engine.ts";
import {
  lockedTradeIds,
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

test("a background reservation permits a new swap of different exact copies", () => {
  const a = {
    instanceId: "a",
    cardId: "a",
    setId: "s",
    finish: "gloss" as const,
    tier: 0 as const,
    obtainedAt: 1,
    openingId: "p",
  };
  const b = { ...a, instanceId: "b" },
    c = { ...a, instanceId: "c" };
  const save = { ...initialSave(), owned: [a, c] };
  const first = {
    id: "old",
    parties: ["alice", "bob"] as [string, string],
    offers: { alice: [a], bob: [b] },
  };
  const second = {
    id: "new",
    parties: ["alice", "carol"] as [string, string],
    offers: { alice: [c], carol: [b] },
  };
  const reserved = prepareTrade(save, first, "alice");
  assert.doesNotThrow(() => prepareTrade(reserved, second, "alice"));
  assert.throws(() =>
    prepareTrade(
      reserved,
      { ...second, offers: { alice: [a], carol: [b] } },
      "alice",
    ),
  );
});

test("many later cancelled attempts cannot evict an unresolved committed exchange", () => {
  const a = {
    instanceId: "reserved",
    cardId: "a",
    setId: "s",
    finish: "gloss" as const,
    tier: 0 as const,
    obtainedAt: 1,
    openingId: "p",
  };
  const terms = {
    id: "committed",
    protocol: 2 as const,
    parties: ["alice", "bob"] as [string, string],
    offers: { alice: [a], bob: [{ ...a, instanceId: "b" }] },
  };
  let s = prepareTrade({ ...initialSave(), owned: [a] }, terms, "alice");
  for (let i = 0; i < 150; i++)
    s = cancelPreparedTrade(s, "cancel-" + i, { ...terms, id: "cancel-" + i });
  assert(s.trades?.some((t) => t.id === "committed" && t.status === "ready"));
  assert(lockedTradeIds(s).has("reserved"));
});

test("device-bound terms keep their digest when stored object keys are reordered", () => {
  const t = {
    id: "sort",
    protocol: 2 as const,
    parties: ["alice", "bob"] as [string, string],
    offers: { alice: [a], bob: [b] },
    devices: { alice: "device-a", bob: "device-b" },
    offerId: "offer",
    expiresAt: 1000,
  };
  assert.equal(
    tradeDigest(t),
    tradeDigest({ ...t, devices: { bob: "device-b", alice: "device-a" } }),
  );
});
