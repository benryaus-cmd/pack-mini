import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, launchOptions } from "./browser-support.mjs";
const app = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await app.listen();
const browser = await chromium.launch(launchOptions);
try {
  const p = await browser.newPage();
  await p.route("**/trade-failure.html", async (r) =>
    r.fulfill({
      contentType: "text/html",
      body: await app.transformIndexHtml(
        "/trade-failure.html",
        "<!doctype html><html><head><title>Trade failure regression</title></head><body></body></html>",
      ),
    }),
  );
  await p.goto(
    `http://127.0.0.1:${app.httpServer.address().port}/trade-failure.html`,
  );
  const result = await p.evaluate(async () => {
    const { trading } = await import("/src/services/trading.ts");
    const { multiplayer, ApiError } =
      await import("/src/services/multiplayer.ts");
    const { initialSave } = await import("/src/game/engine.ts");
    const { prepareTrade, lockedTradeIds, tradeDigest } =
      await import("/src/game/trading.ts");
    const { allCards } = await import("/src/game/catalogue.ts");
    const Trading = trading.constructor;
    const me = "alice",
      other = "bob";
    const def = allCards[0];
    const card = (id) => ({
      instanceId: id,
      cardId: def.id,
      setId: def.setId,
      finish: "gloss",
      tier: def.tier,
      obtainedAt: 1,
      openingId: "old",
    });
    const terms = {
      id: "a".repeat(20),
      parties: [me, other],
      offers: { [me]: [card("a")], [other]: [card("b")] },
    };
    const live = {
      ...terms,
      versions: { [me]: 1, [other]: 1 },
      ready: [],
      status: "draft",
    };
    const game = (saved) => {
      const g = {
        profile: { playerId: me, nickName: me, username: me, avatar: "" },
        save: saved ?? { ...initialSave(), owned: [card("a")] },
      };
      g.update = async (fn) => (g.save = fn(g.save));
      return g;
    };
    const check = (v, s) => {
      if (!v) throw Error(s);
    };
    const packets = [];
    const records = new Map();
    multiplayer.snapshot = () => ({
      status: "online",
      peers: { peer: { profile: { playerId: other } } },
    });
    multiplayer.send = (event, data) => {
      packets.push({ event, data });
      return true;
    };
    let rejectAll = false;
    multiplayer.request = async (path, options) => {
      if (path.includes("/trading/") || rejectAll)
        throw new ApiError(404, "Missing endpoint");
      if (options?.method === "PUT") {
        const body = JSON.parse(options.body);
        const old = records.get(path);
        if ((old?.revision ?? 0) !== body.expectedRevision)
          throw new ApiError(409, "Conflict");
        const record = {
          data: body.data,
          revision: (old?.revision ?? 0) + 1,
          owner: me,
        };
        records.set(path, record);
        return { record };
      }
      if (!records.has(path)) throw new ApiError(404, "Missing record");
      return { record: records.get(path) };
    };
    const a = new Trading(),
      g = game();
    a.bind(g);
    a.state.session = structuredClone(live);
    await a.confirm();
    check(
      records.size === 1,
      "missing trading route must fall back to the supported social namespace",
    );
    check(
      a.snapshot().session.ready.includes(me),
      "published confirmation is visible",
    );
    check(
      packets.some((p) => p.data.action === "ready"),
      "peer receives a ready event after persistence",
    );
    // A restored1.1 journal with no server receipt must offer a safe way out.
    records.clear();
    packets.length = 0;
    const b = new Trading(),
      old = game(prepareTrade(game().save, terms, me));
    b.bind(old);
    await b.recover();
    check(
      b.snapshot().session.status === "unsubmitted",
      "legacy unpublished confirmation must not silently re-lock as sent",
    );
    check(
      lockedTradeIds(old.save).has("a"),
      "cards stay reserved until a safe decision is recorded",
    );
    await b.decline();
    check(
      b.snapshot().session.status === "cancelled",
      "stuck local trade can be cancelled",
    );
    check(
      lockedTradeIds(old.save).size === 0,
      "cancellation releases the exact reserved copies",
    );
    check(
      old.save.owned.length === 1 && old.save.owned[0].instanceId === "a",
      "cancellation never duplicates or removes inventory",
    );
    b.invite(other, ["a"], ["b"]);
    check(b.snapshot().session.status === "draft", "another trade can start");
    // A new definitively rejected write must not strand a new journal.
    rejectAll = true;
    const c = new Trading(),
      fresh = game();
    c.bind(fresh);
    c.state.session = structuredClone(live);
    await c.confirm();
    check(
      c.snapshot().session.status === "cancelled",
      "definitive failed new confirmation clears the ghost session",
    );
    check(
      lockedTradeIds(fresh.save).size === 0,
      "definitive failed write releases its new reservation",
    );
    check(
      fresh.save.owned[0].instanceId === "a",
      "failed confirmation preserves ownership",
    );
    rejectAll = false;
    records.clear();
    const wire = multiplayer.request;
    let loseReply = true;
    multiplayer.request = async (path, options) => {
      const result = await wire(path, options);
      if (loseReply && options?.method === "PUT") {
        loseReply = false;
        throw Error("Lost response after server commit");
      }
      return result;
    };
    const uncertain = new Trading(),
      reserved = game();
    uncertain.bind(reserved);
    uncertain.state.session = structuredClone(live);
    await uncertain.confirm();
    await uncertain.decline();
    check(
      lockedTradeIds(reserved.save).has("a"),
      "lost write acknowledgement must not unlock a published reservation: " +
        JSON.stringify({
          session: uncertain.snapshot(),
          trades: reserved.save.trades,
          records: [...records],
        }),
    );
    check(
      uncertain.snapshot().session.status !== "cancelled",
      "published confirmation cannot be cancelled as unsent",
    );
    await uncertain.recover();
    check(
      uncertain.snapshot().session.status === "settling",
      "lost acknowledgement recovers the persisted ready receipt",
    );
    return [
      "missing endpoint fallback",
      "published ready notification",
      "reload of old unpublished journal",
      "safe durable cancellation",
      "new trade after cancellation",
      "definitive failure cleanup",
    ];
  });
  // Persist a real1.1-style stuck journal, reload the browser, then use the repair UI.
  await p.evaluate(async () => {
    const { initialSave } = await import("/src/game/engine.ts");
    const { allCards } = await import("/src/game/catalogue.ts");
    const { prepareTrade } = await import("/src/game/trading.ts");
    const { transact } = await import("/src/services/persistence.ts");
    const c = allCards[0],
      card = (id) => ({
        instanceId: id,
        cardId: c.id,
        setId: c.setId,
        finish: "holo",
        ham: 10,
        tier: c.tier,
        obtainedAt: 1,
        openingId: "old",
      });
    const t = {
      id: "c".repeat(20),
      parties: ["legacy", "bob"],
      offers: { legacy: [card("kept-copy")], bob: [card("other-copy")] },
    };
    await transact("legacy", () =>
      prepareTrade(
        { ...initialSave(), owned: [card("kept-copy")] },
        t,
        "legacy",
      ),
    );
  });
  await p.reload();
  await p.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const dom = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { trading } = await import("/src/services/trading.ts");
    const { multiplayer, ApiError } =
      await import("/src/services/multiplayer.ts");
    const { Trades } = await import("/src/components/Trades.tsx");
    const { loadSave, transact } = await import("/src/services/persistence.ts");
    const network = {
      status: "online",
      peers: {
        peer: {
          profile: { playerId: "bob", nickName: "Bob" },
          cards: 1,
          level: 1,
        },
      },
    };
    multiplayer.snapshot = () => network;
    multiplayer.send = () => true;
    const records = new Map();
    multiplayer.request = async (path, options) => {
      if (path.includes("/trading/")) throw new ApiError(404, "Missing route");
      if (options?.method === "PUT") {
        const { data } = JSON.parse(options.body);
        const record = { data, owner: "legacy", revision: 1 };
        records.set(path, record);
        return { record };
      }
      if (!records.has(path)) throw new ApiError(404, "Missing record");
      return { record: records.get(path) };
    };
    const game = {
      profile: {
        playerId: "legacy",
        nickName: "Legacy",
        username: "legacy",
        avatar: "",
      },
      save: await loadSave("legacy"),
      busy: false,
    };
    game.update = async (fn) => (game.save = await transact("legacy", fn));
    trading.bind(game);
    await trading.recover();
    window.repair = { trading, game };
    document.body.innerHTML = '<div id="repair-root"></div>';
    (dom.createRoot ?? dom.default.createRoot)(
      document.getElementById("repair-root"),
    ).render(React.createElement(Trades, { game }));
  });
  await p
    .getByRole("button", { name: "CANCEL UNSENT TRADE", exact: true })
    .click();
  await p.getByRole("button", { name: /OFFER TRADE/ }).click();
  assert.equal(
    await p.evaluate(() => window.repair.trading.snapshot().session.status),
    "draft",
  );
  assert.deepEqual(
    await p.evaluate(() =>
      window.repair.game.save.owned.map((c) => c.instanceId),
    ),
    ["kept-copy"],
  );
  await p.reload();
  assert.equal(
    await p.evaluate(async () => {
      const { loadSave } = await import("/src/services/persistence.ts");
      return (await loadSave("legacy")).trades.filter(
        (t) => t.status === "ready",
      ).length;
    }),
    0,
    "cancelled reservation stays released after another browser reload",
  );
  assert.equal(result.length, 6);
  console.log("PASS " + result.join(", "));
} finally {
  await browser.close();
  await app.close();
}
