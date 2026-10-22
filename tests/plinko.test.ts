import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDrop,
  stepDrop,
  disposeDrop,
  simulateDrop,
  DROP_PAYOUTS,
  PEGS,
} from "../src/game/plinko.ts";
test("Matter physics actually moves the ball, collides with pegs and reaches a physical bin", () => {
  const sim = createDrop(123456789);
  const start = { ...sim.ball.position };
  let bounced = false,
    oldX = sim.ball.velocity.x;
  for (let i = 0; i < 7200 && sim.bin === null; i++) {
    stepDrop(sim);
    if (Math.sign(oldX) !== Math.sign(sim.ball.velocity.x)) bounced = true;
    oldX = sim.ball.velocity.x;
  }
  assert(sim.ball.position.y > start.y + 250);
  assert(bounced);
  assert.notEqual(sim.bin, null);
  assert.equal(sim.bin, Math.floor(sim.ball.position.x / 60));
  assert(PEGS.length > 40);
  assert.equal(DROP_PAYOUTS.length, 5);
  disposeDrop(sim);
});
test("persisted seeds replay to identical bins across independent worlds and all payouts stay bounded", () => {
  const bins = new Set<number>();
  for (let i = 0; i < 60; i++) {
    const seed = (i * 2654435761) >>> 0;
    const first = simulateDrop(seed);
    assert.equal(simulateDrop(seed), first);
    assert(first >= 0 && first < 5);
    bins.add(first);
    assert(DROP_PAYOUTS[first] <= 120);
  }
  assert(bins.size >= 3);
});
test("five concurrent live worlds match isolated replay regardless of scheduling", () => {
  const seeds = [12, 31337, 9999, 0xffffffff, 2000000000];
  const sims = seeds.map(createDrop);
  for (let i = 0; i < 7200 && sims.some((s) => s.bin === null); i++)
    for (const s of sims) stepDrop(s);
  for (let i = 0; i < sims.length; i++) {
    assert.equal(sims[i].bin, simulateDrop(seeds[i]));
    disposeDrop(sims[i]);
  }
});
