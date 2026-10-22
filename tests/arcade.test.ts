import { test } from "node:test";
import assert from "node:assert/strict";
import { initialSave } from "../src/game/engine.ts";
import {
  ARCADE_STAKE,
  playArcade,
  arcadeResult,
  startDrop,
  settleDrop,
  recoverDrops,
} from "../src/game/arcade.ts";
const rolls = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
test("reels persist debit and payout atomically and never pay twice after reload or ledger pruning", () => {
  const before = initialSave();
  const won = playArcade(before, "slots", "one", 100, rolls(0));
  assert.equal(won.coins, before.coins - 50 + 150);
  assert.equal(won.ledger[0].delta, 100);
  assert.deepEqual(arcadeResult(won, "one")?.values, [0, 0, 0]);
  const restored = JSON.parse(JSON.stringify(won));
  restored.ledger = [];
  assert.deepEqual(
    playArcade(restored, "slots", "one", 200, rolls(0.8)),
    restored,
  );
});
test("all 27 reel combinations match displayed bounded payouts", () => {
  const counts = new Map<number, number>();
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++)
      for (let c = 0; c < 3; c++) {
        const s = initialSave();
        const next = playArcade(
          s,
          "slots",
          "s",
          100,
          rolls(a / 3, b / 3, c / 3),
        );
        const payout = arcadeResult(next, "s")!.payout;
        counts.set(payout, (counts.get(payout) ?? 0) + 1);
        assert.equal(next.coins, s.coins - ARCADE_STAKE + payout);
      }
  assert.deepEqual(Object.fromEntries(counts), { 0: 6, 60: 18, 150: 3 });
});
test("five drops charge separately before launch and recover exactly once after serializing", () => {
  const initial = initialSave();
  let save = initial;
  for (let i = 0; i < 5; i++)
    save = startDrop(save, `ball${i}`, 100, () => i / 7);
  assert.equal(save.coins, initial.coins - 250);
  assert.equal(save.pendingDrops?.length, 5);
  assert.throws(() => startDrop(save, "sixth"), /Five balls/);
  const recovered = recoverDrops(JSON.parse(JSON.stringify(save)));
  assert.equal(recovered.pendingDrops?.length, 0);
  const payouts = Array.from(
    { length: 5 },
    (_, i) => arcadeResult(recovered, `ball${i}`)!.payout,
  );
  assert(payouts.every((payout) => [0, 80, 120].includes(payout)));
  assert.equal(
    recovered.coins,
    initial.coins - 250 + payouts.reduce((a, b) => a + b, 0),
  );
  assert.deepEqual(
    recoverDrops(JSON.parse(JSON.stringify(recovered))),
    recovered,
  );
  assert.deepEqual(settleDrop(recovered, "ball0"), recovered);
  assert.deepEqual(startDrop(recovered, "ball0"), recovered);
});
test("invalid input and insufficient funds never draw or debit", () => {
  const save = initialSave();
  const poor = { ...save, coins: 49 };
  assert.throws(
    () =>
      startDrop(poor, "poor", 100, () => {
        throw Error("RNG called");
      }),
    /Not enough/,
  );
  for (const value of [NaN, -1, 1, Infinity])
    assert.throws(() => startDrop(save, "bad", 100, () => value), /Random/);
  assert.throws(() => playArcade(save, "slots", "", 100), /transaction/);
  assert.equal(poor.coins, 49);
  assert.equal(save.purchaseIds.length, 0);
});
