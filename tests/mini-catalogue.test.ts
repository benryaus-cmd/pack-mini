import test from "node:test";
import assert from "node:assert/strict";
import { allCards, sets } from "../src/game/catalogue.ts";
import { makeBinders } from "../src/game/binders.ts";
test("focused catalogue contains only eleven requested species, both languages and remote compressed artwork", () => {
  assert.deepEqual(
    [...new Set(allCards.map((c) => c.species))].sort(),
    [
      "Bulbasaur",
      "Charizard",
      "Charmander",
      "Eevee",
      "Greninja",
      "Lucario",
      "Mewtwo",
      "Mimikyu",
      "Pikachu",
      "Squirtle",
      "Umbreon",
    ].sort(),
  );
  assert(allCards.some((c) => c.language === "ja"));
  assert(allCards.some((c) => c.language === "en"));
  assert.equal(new Set(allCards.map((c) => c.id)).size, allCards.length);
  assert.equal(
    new Set(allCards.map((c) => c.language + ":" + c.artId)).size,
    allCards.length,
  );
  assert(
    allCards.every(
      (c) =>
        c.image.startsWith("https://assets.tcgdex.net/") && c.apiId && c.artId,
    ),
  );
});
test("four real pack pools have tenfold costs and language/starter membership", () => {
  assert.deepEqual(
    sets.map((s) => s.price),
    [1000, 1200, 1500, 800],
  );
  assert.equal(sets[0].cards.length, allCards.length);
  assert(sets[1].cards.every((c) => c.language === "en"));
  assert(sets[2].cards.every((c) => c.language === "ja"));
  assert(sets[3].cards.every((c) => [1, 4, 7].includes(c.dexId!)));
  assert(sets.every((s) => s.cards.some((c) => c.tier >= 2)));
  assert(makeBinders(allCards).every((b) => b.cards.length > 0));
});

test("classic Charizard reprints share one artwork slot", () => {
  const c = allCards.find((c) => c.id === "en_base1-4");
  assert(c);
  assert(c.aliases?.some((a) => a.language === "en" && a.apiId === "base4-4"));
  assert(!allCards.some((c) => c.id === "en_base4-4"));
});
