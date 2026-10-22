import test from "node:test";
import assert from "node:assert/strict";
import { initialSave } from "../src/game/engine.ts";
import { gradeCard } from "../src/game/grading.ts";
import { creditsForMarket, sellCard } from "../src/game/selling.ts";
import { makeBinders, earnedBadges, badgesLost } from "../src/game/binders.ts";
import {
  tradeDigest,
  prepareTrade,
  completeTrade,
} from "../src/game/trading.ts";
import type { CardDefinition, OwnedCard } from "../src/game/types.ts";
const card = (instanceId: string, cardId = "en-a"): OwnedCard => ({
  instanceId,
  cardId,
  setId: "base",
  finish: "matte",
  tier: 0,
  obtainedAt: 1,
  openingId: "old",
});
const defs = [
  { id: "en-a", language: "en", artId: "art-a" },
  { id: "ja-a", language: "ja", artId: "art-a" },
  { id: "en-b", language: "en", artId: "art-b" },
].map((c) => ({
  ...c,
  dexId: 1,
  localId: "1",
  name: "Bulbasaur",
  image: "https://example.org",
  setId: "base",
  rarity: "Common",
  tier: 0,
  type: "Grass",
  holo: false,
})) as CardDefinition[];
test("grading boundaries, immutable roll and market multipliers stay exact", () => {
  for (const [rng, ham] of [
    [0, 7],
    [0.349999, 7],
    [0.35, 8],
    [0.699999, 8],
    [0.7, 9],
    [0.949999, 9],
    [0.95, 10],
    [0.999999, 10],
  ]) {
    const s = gradeCard(
      { ...initialSave(), owned: [card("one")] },
      "one",
      () => rng,
    );
    assert.equal(s.owned[0].ham, ham);
    assert.equal(
      gradeCard(s, "one", () => {
        throw Error("rerolled");
      }),
      s,
    );
  }
  for (const [ham, credits] of [
    [undefined, 5000],
    [7, 3000],
    [8, 7000],
    [9, 10000],
    [10, 20000],
  ] as const)
    assert.equal(creditsForMarket(100, ham), credits);
});
test("overlapping art binders retain badges while any last-copy substitute survives", () => {
  const s = {
    ...initialSave(),
    owned: [
      card("en", "en-a"),
      card("ja", "ja-a"),
      card("b", "en-b"),
      card("duplicate", "en-a"),
    ],
  };
  assert.equal(makeBinders(defs).find((b) => b.id === "all")?.cards.length, 2);
  assert(earnedBadges(s, defs).includes("all"));
  assert(!badgesLost(s, ["en"], defs).includes("all"));
  assert(!badgesLost(s, ["en", "duplicate"], defs).includes("all"));
  assert(badgesLost(s, ["en", "duplicate"], defs).includes("english"));
  assert(badgesLost(s, ["en", "duplicate", "ja"], defs).includes("all"));
});
test("sale quote cannot survive a grade change and removes only the sold physical instance", () => {
  const s = { ...initialSave(), owned: [card("one"), card("two")] };
  const quote = {
    cardId: "en-a",
    finish: "matte" as const,
    marketUsd: 100,
    credits: 5000,
    at: 1,
    source: "TCGplayer",
    reference: "normal",
  };
  assert.throws(
    () =>
      sellCard(
        gradeCard(s, "one", () => 0.96),
        "one",
        quote,
        1,
      ),
    /current market quote/,
  );
  const sold = sellCard(s, "one", quote, 1);
  assert.equal(sold.coins, s.coins + 5000);
  assert.deepEqual(
    sold.owned.map((c) => c.instanceId),
    ["two"],
  );
});
test("HAM grade participates in trade digest and transfers without rerolling", () => {
  const mine = { ...card("one"), ham: 10 as const },
    other = { ...card("other", "en-b"), ham: 7 as const };
  const terms = {
    id: "t",
    parties: ["me", "them"] as [string, string],
    offers: { me: [mine], them: [other] },
  };
  assert.notEqual(
    tradeDigest(terms),
    tradeDigest({
      ...terms,
      offers: { ...terms.offers, me: [{ ...mine, ham: 9 }] },
    }),
  );
  const p = prepareTrade({ ...initialSave(), owned: [mine] }, terms, "me");
  assert.equal(
    gradeCard(p, "one", () => 0),
    p,
  );
  const settled = completeTrade(p, terms, "me");
  assert.equal(settled.owned[0].ham, 7);
});
