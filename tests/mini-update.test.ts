import test from "node:test";
import assert from "node:assert/strict";
import { initialSave } from "../src/game/engine.ts";
import { makeBinders, binderOwned, badgesLost } from "../src/game/binders.ts";
import * as arcade from "../src/game/arcade.ts";
import type { CardDefinition, OwnedCard } from "../src/game/types.ts";
const defs = [
  {
    id: "en-a",
    artId: "art-a",
    holo: true,
    rarity: "Uncommon",
    tier: 1,
    language: "en",
    variants: { normal: true, holo: true, reverse: true },
  },
  {
    id: "ja-a",
    artId: "art-a",
    holo: true,
    rarity: "Uncommon",
    tier: 1,
    language: "ja",
    variants: { normal: true, holo: true, reverse: true },
  },
] as CardDefinition[];
const own = (finish: OwnedCard["finish"], instanceId = finish): OwnedCard => ({
  instanceId,
  cardId: "en-a",
  setId: "set",
  finish,
  tier: 1,
  obtainedAt: 1,
  openingId: "old",
});
test("holo and reverse badges require the matching owned finish, never a normal copy or other finish", () => {
  const binders = makeBinders(defs);
  const holo = binders.find((b) => b.id === "holo")!;
  const reverse = binders.find((b) => b.id === "reverse")!;
  assert(reverse, "Reverse Holos replaces the English binder");
  assert(!binders.some((b) => b.id === "english"));
  const save = { ...initialSave(), owned: [own("matte")] };
  assert.equal(binderOwned(holo, save, defs).length, 0);
  assert.equal(binderOwned(reverse, save, defs).length, 0);
  save.owned.push(own("reverse"));
  assert.equal(binderOwned(holo, save, defs).length, 0);
  assert.equal(binderOwned(reverse, save, defs).length, 1);
  save.owned.push(own("holo"));
  assert.equal(binderOwned(holo, save, defs).length, 1);
  assert(badgesLost(save, ["holo"], defs).includes("holo"));
  assert(!badgesLost(save, ["holo"], defs).includes("reverse"));
});
test("drop batch charges atomically, locks further launches, and restores aggregate results across partial settlement", () => {
  assert.equal(typeof arcade.startDropBatch, "function", "batch API exists");
  let save = arcade.startDropBatch(
    initialSave(),
    ["a", "b", "c"],
    1,
    () => 0.5,
  );
  assert.equal(save.coins, 4850);
  assert.throws(() => arcade.startDropBatch(save, ["d"]), /batch|finish|play/i);
  save = arcade.settleDrop(save, "b");
  let result = arcade.dropBatchResult(save);
  assert.equal(result?.stake, 150);
  assert.equal(result?.settled, 1);
  assert.equal(result?.count, 3);
  save = arcade.recoverDrops(JSON.parse(JSON.stringify(save)));
  result = arcade.dropBatchResult(save);
  assert.equal(result?.settled, 3);
  assert.equal(result?.net, result!.payout - 150);
  assert.equal(save.coins, 5000 + result!.net);
  assert.equal(arcade.settleDrop(save, "b"), save);
  assert.throws(
    () =>
      arcade.startDropBatch({ ...initialSave(), coins: 100 }, ["x", "y", "z"]),
    /credits/i,
  );
});
test("new pulls only use supported finishes; modern holo-only rares retain holo while normal/reverse stay distinct", async () => {
  const f = await import("../src/game/finishes.ts");
  assert.equal(
    f.pullFinish(
      { ...defs[0], variants: { normal: true, holo: true, reverse: false } },
      false,
    ),
    "gloss",
  );
  assert.equal(
    f.pullFinish(
      { ...defs[0], variants: { normal: true, holo: true, reverse: true } },
      true,
    ),
    "reverse",
  );
  assert.equal(
    f.pullFinish(
      {
        ...defs[0],
        rarity: "Rare",
        tier: 3,
        variants: { normal: false, holo: true, reverse: true },
      },
      false,
    ),
    "holo",
  );
  assert.equal(f.finishLabel("matte"), "Gloss");
  assert.equal(f.cardLabel(defs[0], "reverse"), "Uncommon · Reverse Holo");
});
test("duplicate selection ranks HAM 7 below ungraded and always selects an exact physical instance", async () => {
  const { bestCopy, copyRank } = await import("../src/game/copies.ts");
  const cards = [
    { ...own("holo"), instanceId: "seven", ham: 7 },
    { ...own("holo"), instanceId: "plain" },
    { ...own("holo"), instanceId: "eight", ham: 8 },
    { ...own("holo"), instanceId: "nine", ham: 9 },
    { ...own("holo"), instanceId: "ten", ham: 10 },
  ] as OwnedCard[];
  assert.deepEqual(
    [...cards]
      .sort((a, b) => copyRank(a) - copyRank(b))
      .map((c) => c.instanceId),
    ["seven", "plain", "eight", "nine", "ten"],
  );
  assert.equal(bestCopy(cards)?.instanceId, "ten");
  assert.equal(bestCopy(cards.slice(0, 2))?.instanceId, "plain");
});
test("shop replaces English with a 2000-credit all-holo pack, sorted by price, while old pending English packs can finish", async () => {
  const { sets, setById } = await import("../src/game/catalogue.ts");
  const { purchase } = await import("../src/game/engine.ts");
  assert.deepEqual(
    sets.map((s) => s.price),
    [800, 1000, 1500, 2000],
  );
  assert(!sets.some((s) => s.id === "mini-en"));
  assert(setById.has("mini-en"));
  const holo = sets.find((s) => s.id === "mini-holo")!;
  assert(holo);
  for (let i = 0; i < 20; i++) {
    const save = purchase(initialSave(), holo, "holo" + i);
    assert(
      save.owned.every((c) =>
        ["holo", "textured", "rainbow", "gold"].includes(c.finish),
      ),
    );
  }
});
