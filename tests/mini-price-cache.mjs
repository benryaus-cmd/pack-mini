import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, launchOptions } from "./browser-support.mjs";
const app = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await app.listen();
const browser = await chromium.launch(launchOptions);
let mode = "initial";
const pending = [];
try {
  const p = await browser.newPage();
  await p.route("**/cache-fixture.html", async (r) =>
    r.fulfill({
      contentType: "text/html",
      body: await app.transformIndexHtml(
        "/cache-fixture.html",
        "<!doctype html><html><head></head><body></body></html>",
      ),
    }),
  );
  await p.route("https://**/*", (r) => {
    if (mode === "offline") return r.abort();
    if (r.request().url().includes("frankfurter"))
      return mode === "eur-fx-offline"
        ? r.abort()
        : r.fulfill({ json: { rates: { USD: 2 } } });
    if (mode.startsWith("eur") && !r.request().url().includes("/en/"))
      return r.fulfill({
        json: {
          pricing: { cardmarket: { trend: mode === "eur-initial" ? 50 : 60 } },
        },
      });
    if (mode === "refresh") {
      pending.push(r);
      return;
    }
    return r.fulfill({
      json: {
        pricing: {
          tcgplayer: {
            normal: {
              marketPrice: r.request().url().includes("/en/") ? 20 : 50,
            },
          },
        },
      },
    });
  });
  const mount = async (onlyCard = false) =>
    p.evaluate(async (onlyCard) => {
      const React = (await import("/node_modules/.vite/deps/react.js")).default;
      const dom = await import("/node_modules/.vite/deps/react-dom_client.js");
      const createRoot = dom.createRoot ?? dom.default.createRoot;
      const { useCollectionValue, useOwnedPrices } =
        await import("/src/services/pricing.ts");
      const { CardPrice } = await import("/src/components/CardView.tsx");
      const { allCards } = await import("/src/game/catalogue.ts");
      const { initialSave } = await import("/src/game/engine.ts");
      const cards = [
        allCards.find((c) => c.language === "en"),
        allCards.find((c) => c.language === "ja"),
      ];
      window.renderValues = [];
      function Probe() {
        const [save, setSave] = React.useState({
          ...initialSave(),
          owned: cards.map((c, i) => ({
            instanceId: "copy-" + i,
            cardId: c.id,
            setId: c.setId,
            finish: "gloss",
            tier: c.tier,
            obtainedAt: i + 1,
            openingId: "p",
          })),
        });
        const value = useCollectionValue(save),
          prices = useOwnedPrices(save);
        const hits = save.owned
          .filter((c) => (prices[c.cardId + ":" + c.finish]?.usd ?? 0) >= 10)
          .map((c) => c.instanceId)
          .join(",");
        window.renderValues.push({ usd: value.usd, hits });
        return React.createElement(
          "div",
          null,
          React.createElement("output", { id: "value" }, value.usd),
          React.createElement("output", { id: "hits" }, hits),
          React.createElement(
            "button",
            {
              onClick: () =>
                setSave((s) => ({ ...s, owned: s.owned.slice(1) })),
            },
            "Remove first",
          ),
        );
      }
      document.body.innerHTML = '<div id="fixture-root"></div>';
      createRoot(document.getElementById("fixture-root")).render(
        onlyCard
          ? React.createElement(CardPrice, {
              cardId: cards[1].id,
              finish: "gloss",
            })
          : React.createElement(Probe),
      );
    }, onlyCard);
  const url = `http://127.0.0.1:${app.httpServer.address().port}/cache-fixture.html`;
  await p.goto(url);
  await mount();
  await p.waitForFunction(
    () => document.querySelector("#value")?.textContent === "70",
  );
  mode = "refresh";
  await p.reload();
  await mount();
  await p.locator("#value").waitFor();
  assert.deepEqual(
    await p.evaluate(() => window.renderValues[0]),
    { usd: 70, hits: "copy-0,copy-1" },
    "first render after reload must use last known prices and hits",
  );
  await p.waitForFunction(
    () => document.querySelector("#value")?.textContent === "70",
  );
  while (pending.length < 2) await p.waitForTimeout(50);
  await pending[0].fulfill({
    json: {
      pricing: {
        tcgplayer: {
          normal: {
            marketPrice: pending[0].request().url().includes("/en/") ? 30 : 60,
          },
        },
      },
    },
  });
  await p.waitForTimeout(100);
  assert.equal(
    await p.locator("#value").innerText(),
    "70",
    "one refreshed quote cannot publish a partial collection total",
  );
  assert.equal(await p.locator("#hits").innerText(), "copy-0,copy-1");
  await pending[1].fulfill({
    json: {
      pricing: {
        tcgplayer: {
          normal: {
            marketPrice: pending[1].request().url().includes("/en/") ? 30 : 60,
          },
        },
      },
    },
  });
  await p.waitForFunction(
    () => document.querySelector("#value")?.textContent === "90",
  );
  mode = "offline";
  await p.reload();
  await mount();
  await p.locator("#value").waitFor();
  assert.deepEqual(await p.evaluate(() => window.renderValues[0]), {
    usd: 90,
    hits: "copy-0,copy-1",
  });
  await p.getByRole("button", { name: "Remove first" }).click();
  await p.waitForFunction(
    () => document.querySelector("#value")?.textContent === "60",
  );
  await p.evaluate(() => localStorage.removeItem("packmini-prices-v1"));
  mode = "eur-initial";
  await p.reload();
  await mount();
  await p.waitForFunction(() =>
    Object.values(
      JSON.parse(localStorage.getItem("packmini-prices-v1") ?? "{}").quotes ??
        {},
    ).some((q) => q.price.currency === "EUR" && q.usd === 100),
  );
  mode = "eur-fx-offline";
  await p.reload();
  await mount(true);
  await p.waitForFunction(() =>
    document
      .querySelector(".card-market-price")
      ?.textContent.includes("€60.00"),
  );
  const euro = await p.evaluate(() =>
    Object.values(
      JSON.parse(localStorage.getItem("packmini-prices-v1")).quotes,
    ).find((q) => q.price.currency === "EUR"),
  );
  assert.equal(
    euro.price.amount,
    50,
    "individual refresh retains the last complete quote while FX is unavailable",
  );
  assert.equal(
    euro.usd,
    100,
    "last converted USD remains available to hits and owned sort",
  );
  mode = "offline";
  await p.reload();
  await mount();
  await p.locator("#hits").waitFor();
  assert.equal(await p.locator("#hits").innerText(), "copy-0,copy-1");
  console.log(
    "PASS: synchronous cached total/hits on reload, atomic background refresh, offline retention, removed copies excluded immediately",
  );
} finally {
  await browser.close();
  await app.close();
}
