import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, launchOptions } from "./browser-support.mjs";

const app = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await app.listen();
const address = app.httpServer.address();
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage();
  await page.route("**/trade-service-fixture.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Trade service regression</title>",
    }),
  );
  await page.goto(
    `http://127.0.0.1:${address.port}/trade-service-fixture.html`,
  );
  const results = await page.evaluate(async () => {
    const { trading } = await import("/src/services/trading.ts");
    const { multiplayer } = await import("/src/services/multiplayer.ts");
    const { initialSave } = await import("/src/game/engine.ts");
    const {
      prepareTrade,
      completeTrade,
      tradeDigest,
      tradeRecordId,
      lockedTradeIds,
    } = await import("/src/game/trading.ts");
    const { cardById } = await import("/src/game/catalogue.ts");
    const Trading = trading.constructor;
    const passed = [];
    const check = (condition, message) => {
      if (!condition) throw Error(message);
    };
    const me = "a_" + "1".repeat(32),
      other = "a_" + "2".repeat(32),
      next = "a_" + "3".repeat(32);
    const definition = [...cardById.values()][0];
    const card = (instanceId) => ({
      instanceId,
      cardId: definition.id,
      setId: definition.setId,
      finish: "matte",
      tier: 0,
      obtainedAt: 1,
      openingId: "pack",
    });
    const a = card("a1"),
      b = card("b1");
    const terms = {
      id: "a".repeat(20),
      parties: [me, other],
      offers: { [me]: [a], [other]: [b] },
    };
    const live = {
      ...terms,
      versions: { [me]: 1, [other]: 1 },
      ready: [],
      status: "draft",
    };
    const packet = {
      action: "ready",
      id: terms.id,
      parties: terms.parties,
      target: me,
      digest: tradeDigest(terms),
    };
    const deferred = () => {
      let resolve;
      const promise = new Promise((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };
    const game = (id = me, save = { ...initialSave(), owned: [a] }) => {
      const g = {
        profile: { playerId: id, nickName: id, username: id, avatar: "" },
        save,
      };
      g.update = async (fn) => {
        g.save = fn(g.save);
        return g.save;
      };
      return g;
    };
    const sent = [];
    const records = new Map();
    multiplayer.snapshot = () => ({
      status: "online",
      peers: { peer: { profile: { playerId: other } } },
    });
    multiplayer.send = (event, data) => {
      sent.push({ event, data });
      return true;
    };
    const normalRequest = async (path, options) => {
      if (options?.method === "PUT") {
        const { data } = JSON.parse(options.body);
        records.set(path, data);
        return { record: { data, revision: 1 } };
      }
      return { record: { data: records.get(path), revision: 0 } };
    };
    multiplayer.request = normalRequest;

    const service = new Trading();
    service.bind(game());
    service.invite(other, ["a1"], ["stale-remote"]);
    service.state.session.status = "completed";
    sent.length = 0;
    await service.accept(
      "trade",
      {
        action: "offer",
        id: "b".repeat(20),
        parties: [other, me],
        target: me,
        offer: [b],
        version: 0,
        requested: ["a1"],
      },
      "peer",
    );
    const reflected = sent.filter((p) => p.data.action === "offer");
    check(
      !reflected.some((p) => p.data.requested?.includes("stale-remote")),
      "old requested cards leaked into a new inbound trade",
    );
    passed.push(
      "old requested cards do not leak into a new inbound trade handshake",
    );
    return passed;
  });
  assert.equal(results.length, 1);
  console.log(results.map((name) => "PASS " + name).join("\n"));
} finally {
  await browser.close();
  await app.close();
}
