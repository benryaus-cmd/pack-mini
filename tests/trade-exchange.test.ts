import test from "node:test";
import assert from "node:assert/strict";
import { TradeExchange } from "../src/services/tradeExchange.ts";
import { initialSave } from "../src/game/engine.ts";
import { lockedTradeIds } from "../src/game/trading.ts";
const card = (id: string) => ({
  instanceId: id,
  cardId: "card",
  setId: "set",
  finish: "holo" as const,
  tier: 2 as const,
  ham: 10 as const,
  obtainedAt: 1,
  openingId: "pack",
});
function fixture() {
  let now = 1000;
  const records = new Map<string, any>(),
    queue: any[] = [];
  let fail = false;
  function actor(player: string, device: string, owned = [card(player)]) {
    const game = {
      save: { ...initialSave(), owned },
      update: async (fn: any) => (game.save = fn(game.save)),
    };
    let active: any = null;
    const x = new TradeExchange({
      player: () => player,
      device: () => device,
      save: () => game.save,
      update: game.update,
      now: () => now,
      online: () => true,
      authorize: (t: any) =>
        t.offerId === "allowed" && t.devices[player] === device,
      send: (data: any) => {
        queue.push({ player, data });
        return true;
      },
      show: (t: any) => (active = t),
      request: async (path: string, options?: RequestInit) => {
        if (fail) throw Object.assign(Error("missing"), { status: 404 });
        const old = records.get(path);
        if (!options?.method) {
          if (!old) throw Object.assign(Error("missing"), { status: 404 });
          return { record: structuredClone(old) };
        }
        const body = JSON.parse(options.body as string);
        if ((old?.revision ?? 0) !== body.expectedRevision)
          throw Object.assign(Error("conflict"), { status: 409 });
        assert(!old || old.owner === player);
        const r = {
          owner: player,
          revision: (old?.revision ?? 0) + 1,
          data: body.data,
        };
        records.set(path, r);
        return { record: structuredClone(r) };
      },
    });
    return { x, game, player, device, active: () => active };
  }
  const a = actor("alice", "device-a"),
    b = actor("bob", "device-b"),
    wrong = actor("bob", "wrong-device", [card("wrong")]);
  async function pump() {
    let n = 0;
    while (queue.length) {
      assert(n++ < 100);
      const p = queue.shift();
      for (const actor of [a, b, wrong])
        if (actor.player !== p.player) await actor.x.receive(p.data, p.player);
    }
  }
  const terms = () => ({
    id: "a".repeat(20),
    protocol: 2 as const,
    parties: ["alice", "bob"] as [string, string],
    offers: { alice: [card("alice")], bob: [card("bob")] },
    devices: { alice: "device-a", bob: "device-b" },
    offerId: "allowed",
    expiresAt: now + 30000,
  });
  return {
    a,
    b,
    wrong,
    records,
    queue,
    pump,
    terms,
    advance: (ms: number) => (now += ms),
    fail: () => (fail = true),
    actor,
  };
}
test("accepting an authorized offer handshakes and applies both devices exactly once without a second user confirmation", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  await f.pump();
  await f.a.x.tick();
  await f.pump();
  await f.a.x.tick();
  assert.equal(f.a.game.save.trades?.[0].status, "completed");
  assert.equal(f.b.game.save.trades?.[0].status, "completed");
  assert.equal(f.a.game.save.owned[0].cardId, "card");
  assert(!f.a.game.save.owned.some((c) => c.instanceId === "alice"));
  assert(!f.b.game.save.owned.some((c) => c.instanceId === "bob"));
  assert.equal(f.wrong.game.save.owned[0].instanceId, "wrong");
  await f.a.x.tick();
  await f.b.x.tick();
  await f.pump();
  assert.equal(f.a.game.save.owned.length, 1);
  assert.equal(f.b.game.save.owned.length, 1);
});
test("an unavailable peer times out and safely returns the original copies", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  f.queue.length = 0;
  f.advance(30001);
  f.a.x.expire();
  assert.equal(f.a.active(), null);
  await f.a.x.tick();
  assert.equal(lockedTradeIds(f.a.game.save).size, 0);
  assert.equal(f.a.game.save.owned[0].instanceId, "alice");
});
test("a committed swap clears foreground after30s and recovers after reload rather than returning cards twice", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  const request = f.queue.shift();
  await f.b.x.receive(request.data, request.player);
  const prepared = f.queue.shift();
  await f.a.x.receive(prepared.data, prepared.player);
  f.queue.length = 0;
  f.advance(30001);
  f.a.x.expire();
  assert.equal(f.a.active(), null);
  assert(lockedTradeIds(f.a.game.save).has("alice"));
  await f.b.x.tick();
  await f.a.x.tick();
  assert.equal(f.a.game.save.trades?.[0].status, "completed");
  assert.equal(f.b.game.save.trades?.[0].status, "completed");
});
test("a definitively unavailable coordinator never exchanges cards and can be cancelled locally", async () => {
  const f = fixture();
  f.fail();
  await assert.rejects(() => f.a.x.start(f.terms()));
  assert.equal(lockedTradeIds(f.a.game.save).size, 0);
  assert.equal(f.a.game.save.owned[0].instanceId, "alice");
});

test("a missing coordinator after commit keeps original copies reserved even when the peer has applied", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  const request = f.queue.shift();
  await f.b.x.receive(request.data, request.player);
  const prepared = f.queue.shift();
  await f.a.x.receive(prepared.data, prepared.player);
  await f.b.x.tick();
  assert.equal(f.b.game.save.trades?.[0].status, "completed");
  f.records.delete("/data/social/mx_" + f.terms().id);
  f.queue.length = 0;
  f.advance(30001);
  await f.a.x.tick();
  assert.equal(f.a.game.save.trades?.[0].status, "ready");
  assert(lockedTradeIds(f.a.game.save).has("alice"));
});
test("restored devices complete a committed swap from durable receipts after every relay packet is lost", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  const request = f.queue.shift();
  await f.b.x.receive(request.data, request.player);
  const prepared = f.queue.shift();
  await f.a.x.receive(prepared.data, prepared.player);
  f.queue.length = 0;
  const a = f.actor("alice", "device-a"),
    b = f.actor("bob", "device-b");
  a.game.save = structuredClone(f.a.game.save);
  b.game.save = structuredClone(f.b.game.save);
  await b.x.tick();
  await a.x.tick();
  assert.equal(a.game.save.trades?.[0].status, "completed");
  assert.equal(b.game.save.trades?.[0].status, "completed");
  assert.equal(a.game.save.owned.length, 1);
  assert.equal(b.game.save.owned.length, 1);
});
test("an abort decision wins over late prepared packets and preserves both original inventories", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  const request = f.queue.shift();
  await f.b.x.receive(request.data, request.player);
  await f.a.x.cancel();
  await f.pump();
  await f.a.x.tick();
  await f.b.x.tick();
  assert.equal(f.a.game.save.owned[0].instanceId, "alice");
  assert.equal(f.b.game.save.owned[0].instanceId, "bob");
  assert.equal(lockedTradeIds(f.a.game.save).size, 0);
  assert.equal(lockedTradeIds(f.b.game.save).size, 0);
});

test("explicit cancel cannot recreate a missing commit record as abort", async () => {
  const f = fixture();
  await f.a.x.start(f.terms());
  const request = f.queue.shift();
  await f.b.x.receive(request.data, request.player);
  const prepared = f.queue.shift();
  await f.a.x.receive(prepared.data, prepared.player);
  await f.b.x.tick();
  f.records.delete("/data/social/mx_" + f.terms().id);
  await assert.rejects(() => f.a.x.cancel(), /committed trade receipt/);
  assert.equal(f.a.game.save.trades?.[0].status, "ready");
  assert(lockedTradeIds(f.a.game.save).has("alice"));
  assert.equal(f.a.active(), null);
});
