import { test } from "node:test";
import assert from "node:assert/strict";
import {
  profileHeader,
  mergeMessages,
  parseHello,
  gamePath,
} from "../src/services/protocol.ts";
test("profile header encodes UTF-8 base64url including unicode nicknames", () => {
  const p = {
    playerId: "a_abc",
    username: "tester",
    nickName: "雪 🎴",
    avatar: "",
  };
  const encoded = profileHeader(p);
  assert(!/[+/=]/.test(encoded));
  assert.deepEqual(
    JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    p,
  );
});
test("all API and socket paths are strictly game2", () => {
  assert.equal(
    gamePath("api"),
    "https://particular-gasoline-corrected-declared.trycloudflare.com/api/v1/games/game2",
  );
  assert.equal(
    gamePath("ws"),
    "wss://particular-gasoline-corrected-declared.trycloudflare.com/ws/game2/lobby",
  );
});
test("chat history and live echoes deduplicate and sort by timestamp", () => {
  const m = { id: "m", playerId: "a", name: "Alice", text: "Hey", at: 1 };
  assert.deepEqual(
    mergeMessages([m], [m, { ...m, id: "n", at: 2 }]).map((x) => x.id),
    ["m", "n"],
  );
  assert.equal(mergeMessages([], [{ ...m, text: 123 }]).length, 0);
});
test("untrusted malformed snapshots are rejected and valid values bounded", () => {
  assert.equal(parseHello({ profile: { playerId: "a" }, cards: "oops" }), null);
  assert.equal(parseHello(null), null);
  const v = parseHello({
    profile: {
      playerId: "a_123",
      username: "A",
      nickName: "Alice",
      avatar: "",
    },
    level: 4,
    cards: 23,
    showcase: ["base1-4"],
    unique: 12,
  });
  assert.equal(v?.cards, 23);
  assert.equal(v?.profile.nickName, "Alice");
  assert.equal(
    parseHello({ profile: { playerId: "../oops", username: "x" }, cards: -10 }),
    null,
  );
});
