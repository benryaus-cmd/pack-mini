import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialSave,
  purchaseAgain,
  purchase,
  claimDaily,
  claimMission,
  recycle,
  finishOpening,
  advanceOpening,
  startReveal,
  summaryOpening,
  rollTier,
  prototypeWeights,
  cardKey,
  claimStudy,
} from "../src/game/engine.ts";
const cards = Array.from({ length: 7 }, (_, tier) => ({
  id: `test-${tier}`,
  localId: String(tier),
  name: `Card ${tier}`,
  setId: "test",
  image: "",
  rarity: String(tier),
  tier,
  type: "Fire",
  holo: tier > 2,
}));
const set = {
  id: "test",
  name: "Test",
  title: "TEST",
  era: "Test",
  price: 1000,
  color: "#fff",
  hero: "test-6",
  total: 7,
  cards,
  logo: "",
  releaseDate: "20000-01-01",
};
const done = (s: any) =>
  finishOpening(summaryOpening(s, s.pending.id), s.pending.id);
const now = Date.UTC(2026, 9, 21, 10);
test("purchase commits debit and unique ownership once and resumes committed opening", () => {
  const a = purchase(initialSave(now), set, "tx1", now, () => 0.5);
  assert.equal(a.coins, 4000);
  assert.equal(a.owned.length, 5);
  assert.equal(new Set(a.owned.map((x) => x.instanceId)).size, 5);
  assert.equal(a.pending?.id, "tx1");
  assert.deepEqual(purchase(a, set, "tx1", now), a);
  assert.throws(() => purchase(a, set, "tx2", now), /Finish/);
  assert.equal(a.ledger[0].delta, -1000);
  assert.equal(a.stats.packs, 1);
});
test("reject invalid purchases and never lose grants when reveal finishes", () => {
  assert.throws(
    () => purchase({ ...initialSave(now), coins: 2 }, set, "tx", now),
    /coins/,
  );
  assert.throws(
    () => purchase(initialSave(now), { ...set, cards: [] }, "tx", now),
    /catalogue/,
  );
  let a = purchase(initialSave(now), set, "tx", now);
  a = advanceOpening(startReveal(a, "tx"), "tx", 0);
  assert.equal(a.pending?.cursor, 1);
  assert.equal(
    finishOpening(summaryOpening(a, a.pending!.id), a.pending!.id).owned.length,
    5,
  );
  assert.equal(
    finishOpening(summaryOpening(a, a.pending!.id), a.pending!.id).pending,
    null,
  );
});
test("all pulls belong to selected set and final slot guarantees at least rare", () => {
  for (let i = 0; i < 300; i++) {
    const a = purchase(initialSave(now), set, `t${i}`, now);
    assert(a.owned.every((c) => cards.some((d) => d.id === c.cardId)));
    assert(a.owned[4].tier >= 2);
  }
});
test("daily UTC claims persist and cannot repeat before next UTC day", () => {
  const a = claimDaily(initialSave(now), now);
  assert.equal(a.coins, 6000);
  assert.throws(() => claimDaily(a, now + 1000), /claimed/);
  assert.equal(claimDaily(a, now + 86400000).coins, 7000);
});
test("mission cannot claim early or twice", () => {
  assert.throws(() => claimMission(initialSave(now), "open1", now), /ready/);
  let a = purchase(initialSave(now), set, "t", now);
  a = claimMission(a, "open1", now);
  assert.equal(a.coins, 4300);
  assert.throws(() => claimMission(a, "open1", now), /claimed/);
});
test("duplicate recycling preserves last copy, favourites and pending rewards", () => {
  let a = done(purchase(initialSave(now), set, "t", now, () => 0.5));
  const copy = a.owned[0];
  assert(a.owned.filter((c) => cardKey(c) === cardKey(copy)).length > 1);
  const b = recycle(a, [copy.instanceId], now);
  assert.equal(b.owned.length, 4);
  assert(b.coins > a.coins);
  assert.throws(
    () => recycle(a, [copy.instanceId, copy.instanceId], now),
    /duplicate/i,
  );
  assert.throws(
    () =>
      recycle({ ...a, favourites: [copy.instanceId] }, [copy.instanceId], now),
    /favourite/,
  );
  assert.throws(
    () =>
      recycle(
        a,
        a.owned.map((x) => x.instanceId),
        now,
      ),
    /last/,
  );
});
test("weighted draws match configured distribution over 100000 seeded samples", () => {
  let seed = 97;
  const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const counts = new Array(7).fill(0);
  for (let i = 0; i < 100000; i++) counts[rollTier([2, 3, 4, 5, 6], rng)]++;
  for (const tier of [2, 3, 4, 5, 6])
    assert(
      Math.abs(counts[tier] / 100000 - prototypeWeights[tier]) < 0.006,
      `${tier}: ${counts[tier]}`,
    );
});
test("legacy rarity pools remain usable with no invented absent tiers", () => {
  for (let i = 0; i < 1000; i++) assert.equal(rollTier([2], Math.random), 2);
});
test("study payouts have UTC limits and cooldown", () => {
  const a = claimStudy(initialSave(now), now);
  assert.equal(a.coins, 5250);
  assert.throws(() => claimStudy(a, now + 1000), /rest/);
  const b = claimStudy(a, now + 31000);
  assert.equal(b.coins, 5500);
  assert.throws(
    () =>
      claimStudy(
        { ...b, study: { day: "2026-10-21", count: 20, last: 0 } },
        now + 60000,
      ),
    /limit/,
  );
});

test("concurrent reveal actions from one observed cursor advance only once", () => {
  let s = purchase(initialSave(now), set, "cursor", now);
  s = { ...s, pending: { ...s.pending!, phase: "reveal" } };
  const once = advanceOpening(s, "cursor", 0);
  const repeated = advanceOpening(once, "cursor", 0);
  assert.equal(repeated.pending?.cursor, 1);
});
test("stale finish and summary actions cannot overwrite a later opening", () => {
  let s = purchase(initialSave(now), set, "old", now);
  s = { ...s, pending: { ...s.pending!, phase: "summary" } };
  s = finishOpening(s, "old");
  s = purchase(s, set, "new", now);
  assert.equal(finishOpening(s, "old").pending?.id, "new");
});
test("collector/premium/free products and bundles use configured counts and costs", () => {
  const full = { ...initialSave(now), coins: 20000 };
  for (const [id, count, cost] of [
    ["collector", 7, 2500],
    ["premium", 10, 5000],
    ["daily", 5, 0],
    ["bundle", 15, 9000],
  ] as const) {
    const s = purchase(full, set, id, now, () => 0.5, id);
    assert.equal(s.owned.length, count);
    assert.equal(s.ledger.find((e) => e.id === id)!.delta, -cost);
    if (id === "premium") assert(s.owned.at(-1)!.tier >= 4);
    if (id === "bundle") {
      assert.equal(s.queued.length, 2);
      assert.equal(s.pending?.instances.length, 5);
    }
  }
});
test("free pack is limited to once per UTC day and never charges", () => {
  let a = purchase(initialSave(now), set, "free1", now, Math.random, "daily");
  assert.equal(a.coins, 5000);
  a = { ...a, pending: null };
  assert.throws(
    () => purchase(a, set, "free2", now, Math.random, "daily"),
    /claimed/,
  );
  assert.equal(
    purchase(a, set, "free3", now + 86400000, Math.random, "daily").owned
      .length,
    10,
  );
});
test("bundle openings promote one by one without losing queued ownership", () => {
  let s = purchase(
    { ...initialSave(now), coins: 20000 },
    set,
    "bundle",
    now,
    Math.random,
    "bundle",
  );
  assert.equal(s.owned.length, 15);
  const first = s.pending!.id;
  s = { ...s, pending: { ...s.pending!, phase: "summary" } };
  s = finishOpening(s, first);
  assert.equal(s.queued.length, 1);
  assert.notEqual(s.pending?.id, first);
  assert.equal(s.owned.length, 15);
  assert.equal(finishOpening(s, first).queued.length, 1);
});

test("open another is one transaction and a repeated action never charges twice", () => {
  let s = purchase(initialSave(now), set, "first", now);
  s = summaryOpening(s, "first");
  const next = purchaseAgain(s, set, "first", "again", now, () => 0.5);
  assert.equal(
    next.ledger.filter((e) => e.delta < 0).reduce((sum, e) => sum + e.delta, 0),
    -2000,
  );
  assert.equal(next.owned.length, 10);
  assert.equal(next.pending?.id, "again");
  assert.deepEqual(purchaseAgain(next, set, "first", "again", now), next);
});
test("open another rejects a stale summary and insufficient coins without discarding the old summary", () => {
  const s = summaryOpening(
    purchase(initialSave(now), set, "first", now),
    "first",
  );
  assert.throws(() => purchaseAgain(s, set, "wrong", "new", now), /changed/);
  assert.throws(
    () => purchaseAgain({ ...s, coins: 0 }, set, "first", "new", now),
    /coins/,
  );
  assert.equal(s.pending?.phase, "summary");
});
