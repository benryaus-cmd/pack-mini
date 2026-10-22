import test from "node:test";
import assert from "node:assert/strict";
import { RelayTradeExchange } from "../src/services/relayTradeExchange.ts";
import { initialSave } from "../src/game/engine.ts";
import { tradeDigest, lockedTradeIds } from "../src/game/trading.ts";
const card = (id: string, ham: 7 | 10 = 10) => ({
  instanceId: id,
  cardId: "card",
  setId: "s",
  finish: "holo" as const,
  tier: 2,
  ham,
  obtainedAt: 1,
  openingId: "p",
});
function fixture() {
  let now = 1000;
  const queue: any[] = [];
  let capacity = Infinity;
  let online = true;
  function actor(
    player: string,
    device: string,
    owned = [card(player, player === "bob" ? 7 : 10)],
  ) {
    const game = {
      save: { ...initialSave(), owned },
      update: async (fn: any) => (game.save = fn(game.save)),
    };
    let active: any = null;
    const x = new RelayTradeExchange({
      player: () => player,
      device: () => device,
      save: () => game.save,
      update: game.update,
      now: () => now,
      online: () => online,
      peerOnline: () => online,
      authorize: (t: any) => t.offerId === "consented",
      send: (packet: any) => {
        assert(
          Buffer.byteLength(
            JSON.stringify({ type: "event", event: "exchange", data: packet }),
          ) <= 1800,
        );
        if (queue.length >= capacity) return false;
        queue.push({ player, packet });
        return true;
      },
      show: (t: any) => (active = t),
    });
    return { x, game, player, device, active: () => active };
  }
  const a = actor("alice", "device-a"),
    b = actor("bob", "device-b"),
    wrong = actor("bob", "device-other", [card("different")]);
  const terms = () => ({
    id: "a".repeat(20),
    protocol: 3 as const,
    parties: ["alice", "bob"] as [string, string],
    offers: { alice: [card("alice")], bob: [card("bob", 7)] },
    devices: { alice: "device-a", bob: "device-b" },
    expiresAt: now + 30000,
    offerId: "consented",
  });
  async function pump(actors = [a, b, wrong]) {
    let n = 0;
    while (queue.length) {
      assert(n++ < 150);
      const { player, packet } = queue.shift();
      for (const c of actors)
        if (c.player !== player) await c.x.receive(packet, player);
    }
  }
  async function phase(receiver: any) {
    const batch = queue.splice(0);
    for (const { player, packet } of batch)
      if (receiver.player !== player) await receiver.x.receive(packet, player);
  }
  return {
    a,
    b,
    wrong,
    actor,
    queue,
    terms,
    pump,
    phase,
    advance: (n: number) => (now += n),
    capacity: (n: number) => (capacity = n),
    offline: () => (online = false),
  };
}
test("relay swaps both exact inventories with one acceptance, no record API, and ignores a sibling device", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  await f.pump();
  assert.equal(f.a.game.save.owned[0].ham, 7);
  assert.equal(f.b.game.save.owned[0].ham, 10);
  assert.equal(f.wrong.game.save.owned[0].instanceId, "different");
  assert(f.a.game.save.trades?.[0].acknowledged);
  assert(f.b.game.save.trades?.[0].acknowledged);
  await f.a.x.tick();
  await f.b.x.tick();
  await f.pump();
  assert.equal(f.a.game.save.owned.length, 1);
  assert.equal(f.b.game.save.owned.length, 1);
});
test("offline peer timeout saves abort before releasing originals and rejects a delayed prepare", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  const delayed = f.queue.splice(0);
  f.advance(30001);
  f.a.x.expire();
  await f.a.x.tick();
  await f.pump();
  for (const { player, packet } of delayed) await f.b.x.receive(packet, player);
  await f.pump();
  assert.equal(f.a.game.save.owned[0].instanceId, "alice");
  assert.equal(f.b.game.save.owned[0].instanceId, "bob");
  assert.equal(lockedTradeIds(f.a.game.save).size, 0);
  assert.equal(lockedTradeIds(f.b.game.save).size, 0);
});
test("commit and receipt packet loss recover from restored local device journals", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  await f.phase(f.b);
  await f.phase(f.a);
  f.queue.length = 0;
  f.advance(30001);
  const a = f.actor("alice", "device-a"),
    b = f.actor("bob", "device-b");
  a.game.save = structuredClone(f.a.game.save);
  b.game.save = structuredClone(f.b.game.save);
  await a.x.tick();
  await f.pump([a, b]);
  assert.equal(a.game.save.trades?.[0].status, "completed");
  assert.equal(b.game.save.trades?.[0].status, "completed");
  assert.equal(a.game.save.owned.length, 1);
  assert.equal(b.game.save.owned.length, 1);
});
test("cancel racing a prepared response cannot return committed cards", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  await f.phase(f.b);
  const ready = f.queue.splice(0);
  await f.a.x.cancel();
  for (const { player, packet } of ready) await f.a.x.receive(packet, player);
  await f.pump();
  assert.equal(f.a.game.save.owned[0].instanceId, "alice");
  assert.equal(f.b.game.save.owned[0].instanceId, "bob");
});

test("reordered and duplicate fragments cannot apply a swap twice", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  const initial = f.queue.splice(0).reverse();
  for (const p of initial) {
    await f.b.x.receive(p.packet, p.player);
    await f.b.x.receive(p.packet, p.player);
  }
  await f.pump();
  await f.a.x.tick();
  await f.b.x.tick();
  await f.pump();
  assert.equal(f.a.game.save.owned.length, 1);
  assert.equal(f.b.game.save.owned.length, 1);
  assert.equal(f.a.game.save.owned[0].ham, 7);
});
test("a sender remains reserved after commit until the offering device applies, then safely finishes after timeout", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  await f.phase(f.b);
  await f.phase(f.a);
  f.queue.length = 0;
  f.advance(30001);
  f.a.x.expire();
  assert.equal(f.a.active(), null);
  assert(lockedTradeIds(f.a.game.save).has("alice"));
  assert.equal(f.a.game.save.trades?.[0].decision, "commit");
  await f.a.x.cancel();
  assert(lockedTradeIds(f.a.game.save).has("alice"));
  await f.a.x.tick();
  await f.pump();
  assert.equal(f.a.game.save.trades?.[0].status, "completed");
  assert.equal(f.b.game.save.trades?.[0].status, "completed");
});

test("pending offline abort retries cannot starve a fresh exchange behind a bounded send queue", async () => {
  const f = fixture();
  const t = f.terms();
  f.a.game.save.trades = Array.from({ length: 20 }, (_, i) => {
    const ghost = "ghost-" + i;
    const terms = {
      ...t,
      id: i.toString(16).padStart(20, "0"),
      parties: ["alice", ghost] as [string, string],
      offers: { alice: t.offers.alice, [ghost]: t.offers.bob },
      devices: { alice: "device-a", [ghost]: "device-b" },
    };
    return {
      ...terms,
      status: "cancelled" as const,
      decision: "abort" as const,
      at: 1,
      digest: tradeDigest(terms),
    };
  });
  f.capacity(4);
  await f.a.x.tick();
  await f.a.x.start(t);
  f.queue.length = 0;
  for (
    let i = 0;
    i < 6 &&
    f.a.game.save.trades?.find((j) => j.id === t.id)?.status !== "completed";
    i++
  ) {
    await f.a.x.tick();
    await f.pump();
    await f.b.x.tick();
    await f.pump();
  }
  assert.equal(
    f.a.game.save.trades?.find((j) => j.id === t.id)?.status,
    "completed",
  );
  assert.equal(f.b.game.save.trades?.[0].status, "completed");
});

test("an uncommitted proposal returns its original copies at the deadline even with its socket offline", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  f.queue.length = 0;
  f.offline();
  f.advance(30001);
  await f.a.x.tick();
  assert.equal(f.a.game.save.trades?.[0].decision, "abort");
  assert.equal(lockedTradeIds(f.a.game.save).size, 0);
  assert.equal(f.a.game.save.owned[0].instanceId, "alice");
  assert.equal(f.a.active(), null);
});
