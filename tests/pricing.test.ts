import test from "node:test";
import assert from "node:assert/strict";
import { parseCardPrice } from "../src/services/pricing.ts";
test("physical market reference uses real USD holofoil field", () => {
  assert.deepEqual(
    parseCardPrice(
      {
        pricing: {
          tcgplayer: {
            updated: "2026-10-21",
            holofoil: { marketPrice: 123.45 },
          },
        },
      },
      "holo",
    ),
    {
      amount: 123.45,
      currency: "USD",
      source: "TCGplayer",
      variant: "holofoil",
      updated: "2026-10-21",
    },
  );
});
test("reverse does not inherit unrelated variants and missing prices stay unavailable", () => {
  assert.equal(
    parseCardPrice(
      { pricing: { tcgplayer: { normal: { marketPrice: 5 } } } },
      "reverse",
    ),
    null,
  );
  for (const v of [
    null,
    {},
    { pricing: { tcgplayer: { normal: { marketPrice: NaN } } } },
  ])
    assert.equal(parseCardPrice(v, "matte"), null);
});
test("Cardmarket supplies EUR fallback without inventing a dollar price", () => {
  const p = parseCardPrice(
    { pricing: { cardmarket: { trend: 3.1 } } },
    "matte",
  );
  assert.equal(p?.currency, "EUR");
  assert.equal(p?.amount, 3.1);
});
