import { createServer } from "vite";
import http from "node:http";
import assert from "node:assert/strict";
import { chromium, launchOptions, dependency } from "./browser-support.mjs";
const { WebSocketServer } = dependency("ws");
const noRecords = process.env.PACK_MINI_NO_RECORDS === "1";
const missingTrading = process.env.PACK_MINI_MISSING_TRADING === "1";
const recordCalls = [];
const records = new Map(),
  clients = new Map();
let next = 0;
const messages = Array.from({ length: 40 }, (_, i) => ({
  id: "history_" + i,
  playerId: "test_1",
  name: "Player 1",
  text: "History message " + i,
  at: 100 + i,
}));
const api = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,X-Player-Profile",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
  res.setHeader("Content-Type", "application/json");
  const send = (x, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(x));
  };
  if (req.method === "OPTIONS") return send({});
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {},
    path = req.url,
    profile = req.headers["x-player-profile"]
      ? JSON.parse(Buffer.from(req.headers["x-player-profile"], "base64url"))
      : null;
  if (path === "/api/v1/schema")
    return send({ store: [{ name: "social", maxBytes: 5120 }] });
  if (path.endsWith("/config")) return send({});
  if (path.includes("/chat/")) {
    if (req.method === "POST") {
      const message = {
        id: "chat_" + messages.length,
        playerId: profile.playerId,
        name: profile.nickName,
        text: body.text,
        at: Date.now(),
      };
      messages.push(message);
      for (const [ws] of clients)
        ws.send(JSON.stringify({ type: "chat", message }));
      return send({ message });
    }
    return send({ messages });
  }
  if (path.includes("/data/")) recordCalls.push(path);
  if (noRecords && path.includes("/data/"))
    return send({ error: "Not Found" }, 404);
  if (path.endsWith("/data/social"))
    return send({
      records: [...records.entries()].map(([id, r]) => ({ id, ...r })),
    });
  if (missingTrading && path.includes("/data/trading/"))
    return send({ error: "Unknown schema" }, 404);
  if (path.includes("/data/social/") || path.includes("/data/trading/")) {
    const id = path.split("/").at(-1),
      old = records.get(id);
    if (req.method === "PUT") {
      if ((old?.revision ?? 0) !== body.expectedRevision) return send({}, 409);
      assert(JSON.stringify(body.data).length <= 5120);
      assert(!old || old.owner === profile.playerId);
      records.set(id, {
        data: body.data,
        owner: profile.playerId,
        revision: (old?.revision ?? 0) + 1,
      });
      return send({ record: records.get(id) });
    }
    return send({ record: old }, old ? 200 : 404);
  }
  return send({ players: [] });
});
const wss = new WebSocketServer({ server: api });
wss.on("connection", (ws) => {
  const id = "c" + ++next;
  clients.set(ws, id);
  ws.send(JSON.stringify({ type: "welcome", id, playersInRoom: clients.size }));
  ws.on("message", (raw) => {
    for (const [other] of clients)
      if (other !== ws)
        other.send(JSON.stringify({ ...JSON.parse(raw), from: id }));
  });
  ws.on("close", () => clients.delete(ws));
});
await new Promise((r) => api.listen(8792, "127.0.0.1", r));
const vite = await createServer({ server: { host: "127.0.0.1", port: 8092 } });
await vite.listen();
const browser = await chromium.launch(launchOptions);
try {
  const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
    ]),
    pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (let i = 0; i < 2; i++) {
    const p = pages[i];
    await p.route("https://**/*", (r) => r.abort());
    await p.route("**/src/main.tsx", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "",
      }),
    );
    await p.goto("http://127.0.0.1:8092");
    await p.evaluate(async (i) => {
      const { multiplayer } = await import("/src/services/multiplayer.ts");
      const { social } = await import("/src/services/social.ts");
      multiplayer.disconnect();
      const profile = {
        playerId: "test_" + i,
        username: "test" + i,
        nickName: "Player " + i,
        avatar: "",
      };
      window.ms = { multiplayer, social, profile };
      multiplayer.setCollector({
        profile,
        level: 1,
        cards: 1,
        unique: 1,
        showcase: [],
      });
      multiplayer.connect("http://127.0.0.1:8792", "mini-lobby");
      social.bind(profile);
    }, i);
  }
  for (const p of pages)
    await p.waitForFunction(
      () => Object.keys(window.ms.multiplayer.snapshot().peers).length === 1,
    );
  if (!noRecords) {
    const message = "actual-message";
    await pages[0].evaluate((id) => window.ms.social.vote(id, 1), message);
    await pages[1].waitForFunction(() =>
      window.ms.social
        .snapshot()
        .entries.some((e) => e.kind === "vote" && e.vote === 1),
    );
    await pages[0].evaluate((id) => window.ms.social.vote(id, -1), message);
    await pages[1].waitForFunction(
      () =>
        window.ms.social.snapshot().entries.filter((e) => e.kind === "vote")
          .length === 1 &&
        window.ms.social.snapshot().entries.find((e) => e.kind === "vote")
          .vote === -1,
    );
    const post = await pages[0].evaluate(async () => {
      const { allCards } = await import("/src/game/catalogue.ts");
      return window.ms.social.post([
        { instanceId: "owned_a", cardId: allCards[0].id, finish: "gold" },
      ]);
    });
    await pages[1].waitForFunction(
      (id) => window.ms.social.snapshot().entries.some((e) => e.id === id),
      post.id,
    );
    const response = await pages[1].evaluate(async (post) => {
      const { allCards } = await import("/src/game/catalogue.ts");
      return window.ms.social.offer(post, [
        { instanceId: "owned_b", cardId: allCards[1].id, finish: "reverse" },
      ]);
    }, post);
    await pages[0].waitForFunction(
      (id) => window.ms.social.snapshot().entries.some((e) => e.id === id),
      response.id,
    );
    await pages[0].waitForFunction(async () => {
      try {
        const r = await window.ms.multiplayer.request("/data/social/ms_test_0");
        return r.record.data.entries.some((e) => e.kind === "post");
      } catch {
        return false;
      }
    });
    await pages[0].evaluate(() => {
      const { social, profile } = window.ms;
      social.stop();
      social.bind(profile);
    });
    await pages[0].waitForFunction(
      (id) => window.ms.social.snapshot().entries.some((e) => e.id === id),
      response.id,
    );
    await pages[0].evaluate(async () => {
      const reactModule = await import("/node_modules/.vite/deps/react.js");
      const React = reactModule.default ?? reactModule;
      const dom = await import("/node_modules/.vite/deps/react-dom_client.js");
      const createRoot = dom.createRoot ?? dom.default.createRoot;
      const { Social } = await import("/src/components/Social.tsx");
      const { initialSave } = await import("/src/game/engine.ts");
      const { allCards } = await import("/src/game/catalogue.ts");
      await import("/src/styles/app.css");
      await import("/src/styles/mini.css");
      await import("/src/styles/mini-update.css");
      const game = {
        profile: window.ms.profile,
        save: {
          ...initialSave(),
          owned: [
            {
              instanceId: "owned_a",
              cardId: allCards[0].id,
              finish: "gold",
              ham: 10,
              tier: 1,
              setId: allCards[0].setId,
              obtainedAt: 1,
              openingId: "test",
            },
          ],
        },
        update: async () => {},
        busy: false,
      };
      document.body.innerHTML = '<div id="test-root"></div>';
      createRoot(document.getElementById("test-root")).render(
        React.createElement(Social, {
          game,
          onInspect: (...args) => {
            window.lastInspection = args;
          },
        }),
      );
      await window.ms.multiplayer.history();
    });
    await pages[0].getByText("History message 39", { exact: true }).waitFor();
    assert.equal(
      await pages[0].getByRole("button", { name: "Server and room" }).count(),
      0,
    );
    assert.equal(await pages[0].getByLabel("Multiplayer server").count(), 0);
    const gutter = await pages[0].locator(".ms-chat").evaluate((e) => {
      const p = e.parentElement,
        s = getComputedStyle(p),
        available =
          p.clientWidth -
          parseFloat(s.paddingLeft) -
          parseFloat(s.paddingRight);
      return parseFloat(getComputedStyle(e).marginLeft) / available;
    });
    assert(
      gutter >= 0.029 && gutter <= 0.031,
      "chat has a 3% scrolling gutter",
    );

    assert(
      await pages[0]
        .locator(".ms-chat")
        .evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight < 3),
      "history scrolls to latest",
    );
    await pages[1].evaluate(() =>
      window.ms.multiplayer.chat("New latest message"),
    );
    await pages[0].getByText("New latest message", { exact: true }).waitFor();
    assert(
      await pages[0]
        .locator(".ms-chat")
        .evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight < 3),
      "incoming chat scrolls to latest",
    );
    await pages[0]
      .getByRole("button", { name: "Show off or trade a card" })
      .click();
    await pages[0]
      .getByRole("dialog")
      .locator(".ms-card-grade")
      .filter({ hasText: "HAM 10" })
      .waitFor();
    await pages[0].getByRole("button", { name: "Close card picker" }).click();
    // Show-offs are persistent chat records with exact grade/finish, not trade invites.
    await pages[0]
      .getByRole("button", { name: "Show off or trade a card" })
      .click();
    await pages[0].locator(".ms-picker-cards>button").first().click();
    await pages[0]
      .getByRole("button", { name: "SHOW OFF", exact: true })
      .click();
    const show = pages[0]
      .locator(".chat-message")
      .filter({ hasText: "Showing off" });
    await show.waitFor();
    assert.equal(
      await show.getByRole("button", { name: "Offer cards" }).count(),
      0,
    );
    assert.equal(
      await show.locator(".ms-reactions button").count(),
      0,
      "reaction counts stay hidden until used",
    );
    await show.getByRole("button", { name: "React to message" }).click();
    assert.equal(await show.locator(".ms-reactions button").count(), 4);
    await show.getByRole("button", { name: "Love reaction" }).click();
    assert.equal(
      (
        await show.getByRole("button", { name: "Love reaction" }).innerText()
      ).replace(/\s/g, ""),
      "❤️1",
    );
    await pages[1].waitForFunction(() =>
      window.ms.social
        .snapshot()
        .entries.some(
          (e) => e.kind === "reaction" && e.reaction === "love" && e.active,
        ),
    );
    await show.locator(".ms-offered-cards>button").click();
    assert.equal(
      await pages[0].evaluate(() => window.lastInspection[1].ham),
      10,
    );
    await pages[0]
      .getByRole("button", { name: "Show off or trade a card" })
      .click();
    await pages[0].locator(".ms-picker-cards>button").first().click();
    await pages[0]
      .getByRole("button", { name: "POST TRADE · 1/3", exact: true })
      .click();
    await pages[0]
      .getByText(/Single-card trade.*Submitting an offer/)
      .waitFor();
    await pages[0]
      .getByRole("button", { name: "CONFIRM SINGLE TRADE", exact: true })
      .click();
    const remove = pages[0]
      .getByRole("button", { name: "Remove trade listing" })
      .last();
    await remove.click();
    await pages[1].waitForFunction(() =>
      window.ms.social.snapshot().entries.some((e) => e.withdrawn),
    );
    const removed = await pages[1].evaluate(() =>
      window.ms.social.snapshot().entries.find((e) => e.withdrawn),
    );
    const denied = await pages[1].evaluate((p) => {
      try {
        window.ms.social.withdraw(p);
        return false;
      } catch {
        return true;
      }
    }, removed);
    assert(denied, "only the author withdraws");
    await pages[0].waitForFunction(async () => {
      try {
        const r = await window.ms.multiplayer.request("/data/social/ms_test_0");
        return r.record.data.entries.some((e) => e.withdrawn);
      } catch {
        return false;
      }
    });
    await pages[0].evaluate(() => {
      const { social, profile } = window.ms;
      social.stop();
      social.bind(profile);
    });
    await pages[0].waitForFunction(
      () =>
        window.ms.social.snapshot().entries.some((e) => e.withdrawn) &&
        window.ms.social.snapshot().entries.some((e) => e.mode === "showcase"),
    );

    await pages[0].getByRole("button", { name: /Offers/ }).click();
    await pages[0].getByRole("button", { name: "Review & accept" }).waitFor();
    assert(records.has("ms_test_0"));
    assert(records.has("ms_test_1"));
  }
  async function mountTrade(page, index, seed = false) {
    await page.evaluate(
      async ({ index, seed }) => {
        const reactModule = await import("/node_modules/.vite/deps/react.js"),
          React = reactModule.default ?? reactModule;
        const dom =
            await import("/node_modules/.vite/deps/react-dom_client.js"),
          createRoot = dom.createRoot ?? dom.default.createRoot;
        const { trading, useTrading } =
          await import("/src/services/trading.ts");
        const { Trades } = await import("/src/components/Trades.tsx");
        const { multiplayer } = await import("/src/services/multiplayer.ts");
        const { initialSave } = await import("/src/game/engine.ts");
        const { allCards } = await import("/src/game/catalogue.ts");
        const { loadSave, transact } =
          await import("/src/services/persistence.ts");
        await import("/src/styles/app.css");
        await import("/src/styles/mini.css");
        await import("/src/styles/mini-update.css");
        window.tradeHarnessRoot?.unmount();
        const profile = {
          playerId: "test_" + index,
          username: "test" + index,
          nickName: "Player " + index,
          avatar: "",
        };
        if (seed)
          await transact(profile.playerId, () => ({
            ...initialSave(),
            owned: [
              {
                instanceId: index ? "owned_b" : "owned_a",
                cardId: allCards[index].id,
                setId: allCards[index].setId,
                finish: index ? "reverse" : "gold",
                ham: index ? 7 : 10,
                tier: allCards[index].tier,
                obtainedAt: 1,
                openingId: "seed",
              },
            ],
          }));
        const saved = await loadSave(profile.playerId);
        multiplayer.disconnect();
        trading.reset();
        multiplayer.setCollector({
          profile,
          level: 1,
          cards: saved.owned.length,
          unique: 1,
          showcase: [],
        });
        multiplayer.connect("http://127.0.0.1:8792", "mini-lobby");
        const { social } = await import("/src/services/social.ts");
        social.bind(profile);
        window.ms = { multiplayer, trading, profile, social };
        document.body.innerHTML = '<div id="trade-root"></div>';
        function Harness() {
          const [save, setSave] = React.useState(saved);
          const game = {
            profile,
            save,
            busy: false,
            update: async (fn) => {
              const value = await transact(profile.playerId, fn);
              setSave(value);
              return value;
            },
          };
          window.ms.game = game;
          useTrading(game);
          React.useEffect(() => {
            window.ms.mounted = true;
          }, []);
          return React.createElement(Trades, { game });
        }
        window.tradeHarnessRoot = createRoot(
          document.getElementById("trade-root"),
        );
        window.tradeHarnessRoot.render(React.createElement(Harness));
      },
      { index, seed },
    );
    await page.waitForFunction(
      () =>
        window.ms.mounted &&
        window.ms.multiplayer.snapshot().status === "online",
    );
  }
  if (!noRecords) {
    for (let i = 0; i < 2; i++) await mountTrade(pages[i], i, true);
    for (const p of pages)
      await p.waitForFunction(() =>
        Object.values(window.ms.multiplayer.snapshot().peers).some(
          (p) => p.profile.playerId !== window.ms.profile.playerId,
        ),
      );
    await pages[0].evaluate(() =>
      window.ms.trading.invite("test_1", ["owned_a"], ["owned_b"]),
    );
    for (const p of pages) {
      await p.waitForFunction(() => {
        const t = window.ms.trading.snapshot().session;
        return (
          t?.offers.test_0?.[0]?.ham === 10 && t?.offers.test_1?.[0]?.ham === 7
        );
      });
      await p.locator('.trade-offers [aria-label="HAM 10"]').waitFor();
      await p.locator('.trade-offers [aria-label="HAM 7"]').waitFor();
      assert.equal(
        await p.locator(".trade-offers .card-view").count(),
        2,
        "both offers prefilled",
      );
    }
    const tradeId = await pages[0].evaluate(
      () => window.ms.trading.snapshot().session.id,
    );
    await pages[0]
      .getByRole("button", { name: "CONFIRM THESE CARDS", exact: true })
      .click();
    await pages[0].waitForFunction(() =>
      window.ms.game.save.trades?.some((t) => t.status === "ready"),
    );
    await pages[1].waitForFunction(() =>
      window.ms.trading.snapshot().session?.ready.includes("test_0"),
    );
    assert.deepEqual(
      await pages[0].evaluate(() =>
        window.ms.game.save.owned.map((c) => [c.instanceId, c.ham]),
      ),
      [["owned_a", 10]],
      "first confirmation does not transfer ownership",
    );
    await pages[0].reload();
    await mountTrade(pages[0], 0, false);
    await pages[0].waitForFunction(
      () => window.ms.trading.snapshot().session?.status === "settling",
    );
    await pages[0].locator('.trade-offers [aria-label="HAM 10"]').waitFor();
    await pages[0].locator('.trade-offers [aria-label="HAM 7"]').waitFor();
    await pages[1]
      .getByRole("button", { name: "CONFIRM THESE CARDS", exact: true })
      .click();
    for (const p of pages)
      await p.waitForFunction(
        () => window.ms.trading.snapshot().session?.status === "completed",
        {},
        { timeout: 20000 },
      );
    for (let i = 0; i < 2; i++) {
      await pages[i].waitForFunction(
        async ({ id, missingTrading }) => {
          try {
            const { tradeRecordId } = await import("/src/game/trading.ts");
            const r = await window.ms.multiplayer.request(
              "/data/" +
                (missingTrading ? "social" : "trading") +
                "/" +
                tradeRecordId(id, window.ms.profile.playerId),
            );
            return r.record?.data?.status === "completed";
          } catch {
            return false;
          }
        },
        { id: tradeId, missingTrading },
      );
      const value = await pages[i].evaluate(async () => {
        const { loadSave } = await import("/src/services/persistence.ts");
        return loadSave(window.ms.profile.playerId);
      });
      assert.equal(value.owned.length, 1, "one card after settlement");
      assert.equal(
        value.owned[0].ham,
        i ? 10 : 7,
        "HAM grade transfers unchanged",
      );
      assert.equal(
        value.owned[0].finish,
        i ? "gold" : "reverse",
        "finish transfers unchanged",
      );
      assert.equal(
        value.trades.filter((t) => t.id === tradeId && t.status === "completed")
          .length,
        1,
        "single completed journal",
      );
      assert.equal(
        value.owned[0].instanceId,
        `tr_${tradeId}_0`,
        "deterministic incoming instance",
      );
      await pages[i].evaluate(async () => {
        await window.ms.trading.recover();
        await window.ms.trading.recover();
      });
      const count = await pages[i].evaluate(async () => {
        const { loadSave } = await import("/src/services/persistence.ts");
        return (await loadSave(window.ms.profile.playerId)).owned.length;
      });
      assert.equal(count, 1, "repeated recovery cannot duplicate cards");
    }
    assert.equal(
      [...records.values()].filter(
        (r) => r.data.id === tradeId && r.data.status === "completed",
      ).length,
      2,
      "both per-owner completion receipts persisted",
    );
  }
  // New consent flow: submitting the social offer authorizes the peer client.
  // Only the listing owner taps CONFIRM; the offering client has no second tap.
  for (let i = 0; i < 2; i++) await mountTrade(pages[i], i, true);
  for (const p of pages)
    await p.waitForFunction(() =>
      Object.values(window.ms.multiplayer.snapshot().peers).some(
        (p) => p.profile.playerId !== window.ms.profile.playerId,
      ),
    );
  for (const p of pages) {
    await p.evaluate(async () => {
      await window.ms.game.update((s) => ({
        ...s,
        owned: [0, 1, 2].map((i) => ({
          ...s.owned[0],
          instanceId: crypto.randomUUID(),
          openingId: crypto.randomUUID(),
        })),
      }));
    });
    await p.waitForFunction(() => window.ms.game.save.owned.length === 3);
  }
  const postId = await pages[0].evaluate(
    () => window.ms.social.post(window.ms.game.save.owned, "trade").id,
  );
  await pages[1].waitForFunction(
    (id) => window.ms.social.snapshot().entries.some((e) => e.id === id),
    postId,
  );
  const offerId = await pages[1].evaluate(
    (id) =>
      window.ms.social.offer(
        window.ms.social.snapshot().entries.find((e) => e.id === id),
        window.ms.game.save.owned,
      ).id,
    postId,
  );
  await pages[0].waitForFunction(
    (id) => window.ms.social.snapshot().entries.some((e) => e.id === id),
    offerId,
  );
  await pages[0].evaluate(
    (id) =>
      window.ms.trading.reviewOffer(
        window.ms.social.snapshot().entries.find((e) => e.id === id),
      ),
    offerId,
  );
  const exchangeId = await pages[0].evaluate(
    () => window.ms.trading.snapshot().session.id,
  );
  await pages[0]
    .getByRole("button", { name: "CONFIRM THESE CARDS", exact: true })
    .click();
  for (const p of pages)
    await p
      .waitForFunction(
        (id) =>
          window.ms.game.save.trades?.some(
            (j) => j.id === id && j.status === "completed" && j.acknowledged,
          ),
        exchangeId,
        { timeout: 12000 },
      )
      .catch(async (e) => {
        console.log(
          "EXCHANGE DEBUG",
          JSON.stringify(
            await Promise.all(
              pages.map((p) =>
                p.evaluate(() => ({
                  state: window.ms.trading.snapshot(),
                  save: window.ms.game.save,
                  entries: window.ms.social
                    .snapshot()
                    .entries.filter((e) => e.kind === "offer")
                    .slice(-2),
                  peers: window.ms.multiplayer.snapshot().peers,
                })),
              ),
            ),
          ),
        );
        console.log(
          "COORDINATORS",
          JSON.stringify(
            [...records.entries()].filter(
              ([key]) => key.startsWith("mx_") || key.startsWith("mr_"),
            ),
          ),
        );
        throw e;
      });
  for (let i = 0; i < 2; i++) {
    const own = await pages[i].evaluate(() => window.ms.game.save.owned);
    assert.equal(own.length, 3);
    assert.equal(own[0].ham, i ? 10 : 7);
    assert.equal(
      await pages[i].evaluate(() => window.ms.trading.snapshot().session),
      null,
    );
    await pages[i].reload();
    await mountTrade(pages[i], i, false);
    assert.equal(
      await pages[i].evaluate(() => window.ms.game.save.owned.length),
      3,
    );
  }
  assert(
    !recordCalls.some(
      (path) => /\/data\/social\/(mx_|mr_)/.test(path) && noRecords,
    ),
    "new relay trade never requires a generic trade record",
  );
  console.log(
    noRecords
      ? "PASS: all generic record routes return404; device-bound three-card relay trade completes with one human acceptance and survives reload; no generic trade record requests."
      : "PASS: social messages/offers and legacy recovery; device-bound three-card relay trade with one acceptance, exact HAM grades, and reload persistence.",
  );
} finally {
  await browser.close();
  await vite.close();
  for (const [ws] of clients) ws.terminate();
  await new Promise((r) => wss.close(r));
  await new Promise((r) => api.close(r));
}
