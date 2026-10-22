import { createServer } from "vite";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, launchOptions } from "./browser-support.mjs";
const app = await createServer({ server: { host: "127.0.0.1", port: 8093 } });
await app.listen();
const browser = await chromium.launch(launchOptions);
const errors = [];
const art = fs.readFileSync("tests/fixtures/card.webp");
try {
  for (const width of [280, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 700 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      Math.random = () => 0.99;
    });
    await context.route("https://**/*", (r) => {
      const url = r.request().url();
      if (url.includes("api.tcgdex.net"))
        return r.fulfill({
          json: {
            pricing: {
              tcgplayer: {
                normal: { marketPrice: 1 },
                holofoil: { marketPrice: 1 },
                "reverse-holofoil": { marketPrice: 1 },
              },
            },
          },
        });
      if (
        url.includes("assets.tcgdex.net") ||
        url.includes("images.pokemontcg.io")
      )
        return r.fulfill({ contentType: "image/webp", body: art });
      return r.abort();
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://127.0.0.1:8093");
    await p.getByRole("button", { name: "Settings", exact: true }).waitFor();
    await p
      .getByRole("button", { name: "CLAIM FREE PACK", exact: true })
      .click();
    await p.getByRole("button", { name: /or tap to rip/ }).click();
    await p.getByRole("button", { name: "Reveal all", exact: true }).click();
    await p.getByRole("button", { name: /BACK TO/ }).click();
    assert.equal(await p.locator(".mini-daily").count(), 0);
    await p
      .getByRole("navigation")
      .getByRole("button", { name: "SHOP", exact: true })
      .click();
    await p.locator(".mini-pack").first().waitFor();
    assert.equal(await p.locator(".mini-pack").count(), 4);
    for (const box of await p.locator(".mini-pack").evaluateAll((es) =>
      es.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, right: r.right, y: r.y, bottom: r.bottom };
      }),
    ))
      assert(
        box.x >= 0 && box.right <= width && box.bottom < 700,
        JSON.stringify({ width, box }),
      );
    await p.evaluate(async () => {
      const { makeBinders } = await import("/src/game/binders.ts");
      const { allCards } = await import("/src/game/catalogue.ts");
      const { transact } = await import("/src/services/persistence.ts");
      const { utcDay } = await import("/src/game/engine.ts");
      const b = makeBinders(allCards).find((b) => b.id === "rare");
      await transact(localStorage.getItem("packmini-browser-id"), (s) => ({
        ...s,
        pending: null,
        queued: [],
        lastFreePack: utcDay(),
        owned: b.cards.map((c, i) => ({
          instanceId: "seed" + i,
          cardId: c.id,
          setId: c.setId,
          finish: "holo",
          tier: c.tier,
          obtainedAt: 1,
          openingId: "seed",
        })),
      }));
    });
    await p.reload();
    await p.getByRole("button", { name: "Settings", exact: true }).waitFor();
    await p
      .getByRole("navigation")
      .getByRole("button", { name: "CARDS", exact: true })
      .click();
    await p
      .getByRole("button", { name: /RARE.*BADGE EARNED/ })
      .first()
      .click();
    await p.locator(".binder-slot").first().click();
    await p.getByRole("button", { name: "FREE HAM GRADE · ONE ROLL" }).click();
    await p.getByText(/HAM 10 — PERFECT/).waitFor();
    await p.getByRole("button", { name: "SELL CARD · MARKET OFFER" }).click();
    await p
      .getByRole("button", { name: "CONFIRM SELL · 200 CREDITS" })
      .waitFor();
    await p.locator(".sell-warning").waitFor();
    await p.getByRole("button", { name: "CONFIRM SELL · 200 CREDITS" }).click();
    await p.getByText("Sold! Credits added.").waitFor();
    await p.getByRole("button", { name: "Back to binders" }).click();
    assert.equal(
      await p.getByRole("button", { name: /RARE.*BADGE EARNED/ }).count(),
      0,
    );
    await p
      .getByRole("navigation")
      .getByRole("button", { name: "HOME", exact: true })
      .click();
    await p.getByRole("button", { name: /EARN CREDITS/ }).click();
    await p.getByRole("button", { name: /Collector’s Eye/ }).click();
    assert.equal(await p.locator(".study-grid button").count(), 12);
    const buttons = p.locator(".study-grid button");
    for (let life = 0; life < 4; life++) {
      await buttons.nth(0).click();
      await buttons.nth(1).click();
      await p.waitForTimeout(720);
    }
    await p.getByText("Out of lives. Try again.").waitFor();
    await p.getByRole("button", { name: "TRY AGAIN", exact: true }).click();
    await p.getByLabel("4 lives remaining").waitFor();
    await p.getByRole("button", { name: "Close dialog" }).click();
    await p
      .getByRole("button", { name: "Offer notifications", exact: true })
      .click();
    await p.locator(".ms-notifications").waitFor();
    await p.getByRole("button", { name: "Close dialog" }).click();
    const header = await p
      .locator(".app-header")
      .evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    assert(header.scroll <= header.client + 1, JSON.stringify(header));
    await p.screenshot({ path: `test-results/mini-home-${width}.png` });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS mini phone screens, free daily pack, four packs fit, HAM10 grade/sale200+badge loss, four-life retry, global offers, no overflow/runtime errors.",
  );
} finally {
  await browser.close();
  await app.close();
}
