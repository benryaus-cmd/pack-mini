import test from "node:test";
import assert from "node:assert/strict";
import * as social from "../src/game/social.ts";
test("withdrawal belongs to its author and delayed packets cannot revive a withdrawn trade", () => {
  const post = {
    id: "p",
    player: "a",
    room: "mini",
    at: 1,
    kind: "post",
    mode: "trade",
    cards: [{ instanceId: "x", cardId: "a", finish: "holo" }],
  } as social.SocialEntry;
  const withdrawn = { ...post, at: 2, withdrawn: true };
  const merged = social.mergeSocial(
    [withdrawn],
    [
      { ...post, at: 3 },
      { ...post, player: "b", at: 4 },
    ],
  );
  assert.equal(merged.find((e) => e.player === "a")?.withdrawn, true);
  assert.equal(merged.length, 2);
  assert.equal(
    social.livePosts(merged).some((e) => e.player === "a"),
    false,
  );
});
test("emoji toggles replace only that collector’s same reaction and preserve other collectors’ counts", () => {
  const base = {
    id: "r1",
    player: "a",
    room: "mini",
    at: 1,
    kind: "reaction",
    message: "m",
    reaction: "love",
    active: true,
  } as social.SocialEntry;
  const merged = social.mergeSocial(
    [base, { ...base, id: "r2", player: "b" }],
    [{ ...base, id: "r3", at: 2, active: false }],
  );
  assert.equal(merged.filter((e) => e.active).length, 1);
  assert.equal(merged.find((e) => e.player === "b")?.active, true);
});
test("withdrawals survive hundreds of later messages, persistence trimming, and delayed original packets", () => {
  const post = {
    id: "old",
    player: "a",
    room: "mini",
    at: 1,
    kind: "post",
    mode: "trade",
    cards: [{ instanceId: "x", cardId: "a", finish: "holo" }],
  } as social.SocialEntry;
  let history = social.mergeSocial([], [{ ...post, at: 2, withdrawn: true }]);
  for (let i = 0; i < 500; i++)
    history = social.mergeSocial(history, [
      { ...post, id: "new" + i, at: i + 3 },
    ]);
  const persisted = social.retainSocial(history, 48);
  assert(
    !social
      .livePosts(social.mergeSocial(persisted, [post]))
      .some((p) => p.id === "old"),
  );
  // A bounded removal journal compacts to an author cutoff before reaching the server budget.
  let withdrawals = [] as social.SocialEntry[];
  for (let i = 0; i < 100; i++)
    withdrawals = social.retainSocial(
      social.mergeSocial(withdrawals, [
        { ...post, id: "removed" + i, at: i + 2, withdrawn: true },
      ]),
    );
  assert(JSON.stringify(withdrawals).length < 4000);
  assert(
    !social
      .livePosts(social.mergeSocial(withdrawals, [post]))
      .some((p) => p.id === "old"),
  );
});
test("compacting removal history preserves unrelated live showoffs and trade listings", () => {
  const post = {
    id: "show",
    player: "a",
    room: "mini",
    at: 1,
    kind: "post",
    mode: "showcase",
    cards: [{ instanceId: "x", cardId: "a", finish: "holo" }],
  } as social.SocialEntry;
  let entries = [
    post,
    { ...post, id: "trade", mode: "trade" },
  ] as social.SocialEntry[];
  for (let i = 0; i < 100; i++)
    entries = social.retainSocial(
      social.mergeSocial(entries, [
        { ...post, id: "removed" + i, at: i + 2, withdrawn: true },
      ]),
    );
  assert.deepEqual(
    social
      .livePosts(entries)
      .map((e) => e.id)
      .sort(),
    ["show", "trade"],
  );
  const restored = social.mergeSocial([], social.retainSocial(entries, 48));
  assert.deepEqual(
    social
      .livePosts(restored)
      .map((e) => e.id)
      .sort(),
    ["show", "trade"],
  );
  assert(
    !social
      .livePosts(social.mergeSocial(restored, [{ ...post, id: "removed0" }]))
      .some((e) => e.id === "removed0"),
  );
});
test("receivers retain delayed legitimate posts regardless of withdrawal packet arrival order", () => {
  const show = {
    id: "show",
    player: "a",
    room: "mini",
    at: 1,
    kind: "post",
    mode: "showcase",
    cards: [{ instanceId: "x", cardId: "a", finish: "holo" }],
  } as social.SocialEntry;
  const removed = Array.from({ length: 17 }, (_, i) => ({
    ...show,
    id: "removed" + i,
    at: i + 2,
    withdrawn: true,
  }));
  const first = social.mergeSocial([show], removed);
  const delayed = social.mergeSocial(social.mergeSocial([], removed), [show]);
  assert.deepEqual(social.livePosts(first), social.livePosts(delayed));
});
