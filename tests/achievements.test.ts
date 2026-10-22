import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialSave,
  purchase,
  summaryOpening,
  finishOpening,
} from "../src/game/engine.ts";
import { achievements, claimAchievement } from "../src/game/achievements.ts";
import { recordLimit } from "../src/services/protocol.ts";
const cards = Array.from({ length: 8 }, (_, i) => ({
  id: "set-" + i,
  localId: String(i),
  name: "Card " + i,
  setId: "set",
  image: "",
  tier: i < 4 ? 0 : 3,
  rarity: "Rare",
  type: "Fire",
  holo: i >= 4,
}));
const catalogue = [
  {
    id: "set",
    name: "Test Set",
    era: "Era",
    title: "Set",
    price: 100,
    color: "#fff",
    releaseDate: "2000",
    logo: "",
    hero: "set-7",
    total: 8,
    cards,
  },
];
const own = (id: string, i: number) => ({
  instanceId: "instance_" + i,
  cardId: id,
  setId: "set",
  tier: 0,
  finish: "matte" as const,
  obtainedAt: 1,
  openingId: "pack",
});
test("set milestones count unique printed definitions rather than duplicates or unknown entries", () => {
  const save = {
    ...initialSave(),
    owned: [own("set-0", 0), own("set-0", 1), own("unknown", 2)],
  };
  const row = achievements(save, catalogue).find((a) => a.id === "set_set_25")!;
  assert.equal(row.value, 1);
  assert.equal(row.target, 2);
  assert.throws(() => claimAchievement(save, row.id, catalogue), /ready/);
});
test("milestone rewards persist once and completion requires every actual card", () => {
  let save = { ...initialSave(), owned: cards.map((c, i) => own(c.id, i)) };
  const complete = achievements(save, catalogue).find(
    (a) => a.id === "set_set_100",
  )!;
  assert.equal(complete.value, 8);
  save = claimAchievement(save, complete.id, catalogue, 123);
  assert.equal(save.coins, 6500);
  assert.equal(save.ledger[0].delta, 1500);
  assert.throws(
    () => claimAchievement(save, complete.id, catalogue, 124),
    /claimed/,
  );
  assert.throws(() => claimAchievement(save, "invented", catalogue), /Unknown/);
});
test("rare-pull achievements use persistent best-tier history and survive recycling", () => {
  const save = {
    ...initialSave(),
    stats: { ...initialSave().stats, bestTier: 5 },
  };
  const award = achievements(save, catalogue).find((a) => a.id === "rare_5")!;
  assert.equal(award.value, 5);
  assert.equal(claimAchievement(save, "rare_5", catalogue).coins, 6000);
  assert.throws(() => claimAchievement(save, "rare_6", catalogue), /ready/);
});
test("real schema store array supplies exact storage budget and unknown formats stay conservative", () => {
  assert.equal(
    recordLimit(
      {
        version: 3,
        store: [
          { name: "social", maxBytes: 5120 },
          { name: "inventory", maxBytes: 5120 },
        ],
      },
      "social",
    ),
    5120,
  );
  assert.equal(
    recordLimit({ schemas: { social: { maxBytes: 2048 } } }, "social"),
    2048,
  );
  assert.equal(
    recordLimit({ store: [{ name: "social", maxBytes: -1 }] }, "social"),
    512,
  );
  assert.equal(recordLimit(null, "social"), 512);
});
