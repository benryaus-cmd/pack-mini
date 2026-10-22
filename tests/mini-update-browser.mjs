import { createServer } from "vite";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, launchOptions } from "./browser-support.mjs";
const app = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await app.listen();
const url = `http://127.0.0.1:${app.httpServer.address().port}`;
const browser = await chromium.launch(launchOptions);
const art = fs.readFileSync("tests/fixtures/card.webp");
const errors = [];
fs.mkdirSync("test-results", { recursive: true });
try {
  for (const [width, height] of [
    [390, 700],
    [280, 560],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
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
                normal: { marketPrice: 600 },
                holofoil: { marketPrice: 600 },
                "reverse-holofoil": { marketPrice: 600 },
              },
            },
          },
        });
      if (
        url.includes("assets.tcgdex.net") ||
        url.includes("images.pokemontcg.io")
      )
        return r.fulfill({
          body: art,
          contentType: "image/webp",
          headers: { "access-control-allow-origin": "*" },
        });
      return r.abort();
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(url);
    await p
      .getByRole("button", { name: "CLAIM FREE PACK", exact: true })
      .click();
    await p.getByRole("button", { name: /or tap to rip/ }).click();
    await p.getByRole("button", { name: "REVEAL CARD", exact: true }).click();
    await p.getByText("FUCKING AMAZING!", { exact: false }).waitFor();
    const stage = p.locator(".reveal-stage");
    const box = await stage.boundingBox();
    const y = box.y + box.height * 0.45;
    const start = width * 0.35;
    // Small drags are only tilt, including ones that cross the old 48px threshold.
    await p.mouse.move(start, y);
    await p.mouse.down();
    await p.mouse.move(start + 65, y, { steps: 5 });
    assert.equal(await p.locator(".swipe-armed").count(), 0);
    const mx = await p
      .locator(".revealed-card .card-view")
      .evaluate((e) => e.style.getPropertyValue("--mx"));
    assert(mx, "the same captured drag must reach the card lighting surface");
    await p.mouse.up();
    assert((await p.locator(".card-index").innerText()).includes("1 / 5"));
    assert.equal(await p.locator(".opening-grade").count(), 0);
    // Long right drag arms before release and grades the same visible card.
    const dx = Math.max(100, width * 0.34) + 8;
    await p.mouse.move(width * 0.23, y);
    await p.mouse.down();
    await p.mouse.move(width * 0.23 + dx, y, { steps: 8 });
    await p.getByText("Release to grade card →", { exact: true }).waitFor();
    assert.equal(
      await p
        .locator(".swipe-edge-right")
        .evaluate((e) => getComputedStyle(e).opacity),
      "1",
    );
    await p.mouse.up();
    await p.locator(".opening-grade").filter({ hasText: "HAM 10" }).waitFor();
    assert((await p.locator(".card-index").innerText()).includes("1 / 5"));
    const controls = await p.locator(".opening-action-row").boundingBox();
    assert(controls.y + controls.height <= height, "actions fit the phone");
    await p.screenshot({ path: `test-results/mini11-opening-${width}.png` });
    // Left release advances exactly once.
    await p.mouse.move(width * 0.75, y);
    await p.mouse.down();
    await p.mouse.move(width * 0.75 - dx, y, { steps: 8 });
    await p.getByText("← Release for next card", { exact: true }).waitFor();
    await p.mouse.up();
    await p.waitForFunction(() =>
      document.querySelector(".card-index")?.textContent.includes("2 / 5"),
    );
    await p.getByRole("button", { name: "Reveal all", exact: true }).click();
    assert.equal(
      await p
        .locator(".summary-grid")
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
        ),
      5,
    );
    assert.equal(
      await p.getByRole("button", { name: /BACK TO THE UNIVERSE/ }).count(),
      0,
    );
    await p.getByRole("button", { name: "Close completed pack" }).click();
    await p.getByRole("button", { name: "Settings", exact: true }).waitFor();
    const cleared = await p.evaluate(async () => {
      const { loadSave } = await import("/src/services/persistence.ts");
      return !(await loadSave(localStorage.getItem("packmini-browser-id")))
        .pending;
    });
    assert(cleared);
    await p.locator(".recent-row .card-view").first().waitFor();
    // Seed five different physical copies of one artwork.
    await p.evaluate(async () => {
      const { transact } = await import("/src/services/persistence.ts");
      const { cardById } = await import("/src/game/catalogue.ts");
      const c = cardById.get("en_base1-4");
      await transact(localStorage.getItem("packmini-browser-id"), (s) => ({
        ...s,
        pending: null,
        queued: [],
        owned: [7, undefined, 8, 9, 10].map((ham, i) => ({
          instanceId: "copy-" + i,
          cardId: c.id,
          setId: c.setId,
          finish: i === 1 ? "reverse" : "holo",
          ham,
          tier: c.tier,
          obtainedAt: 1,
          openingId: "seed",
        })),
      }));
    });
    await p.reload();
    await p
      .getByRole("navigation")
      .getByRole("button", { name: "CARDS", exact: true })
      .click();
    await p.getByRole("button", { name: /ALL ART/ }).click();
    await p.getByRole("button", { name: "owned", exact: true }).click();
    assert.equal(await p.locator(".binder-slot").count(), 1);
    await p.locator('.binder-slot [aria-label="HAM 10"]').waitFor();
    await p.locator(".binder-slot").click();
    await p.getByLabel("Choose physical copy").waitFor();
    await p
      .getByLabel("Choose physical copy")
      .getByRole("button", { name: /UNGRADED/ })
      .click();
    const sell = p.getByRole("button", {
      name: /SELL CARD · UNGRADED · REVERSE HOLO/,
    });
    await sell.click();
    await p
      .getByRole("dialog", { name: "Sell card" })
      .getByText(/ID …copy-1/)
      .waitFor();
    await p
      .getByRole("button", { name: "CONFIRM SELL · 30000 CREDITS" })
      .click();
    await p.getByText("Sold! Credits added.").waitFor();
    const remaining = await p.evaluate(async () => {
      const { loadSave } = await import("/src/services/persistence.ts");
      return (
        await loadSave(localStorage.getItem("packmini-browser-id"))
      ).owned.map((c) => c.instanceId);
    });
    assert(!remaining.includes("copy-1"));
    assert(remaining.includes("copy-4"));
    await p.locator(".binder-slot").click();
    await p
      .getByLabel("Choose physical copy")
      .getByRole("button", { name: /HAM 7/ })
      .click();
    await p.screenshot({ path: `test-results/mini11-copies-${width}.png` });
    await p.getByRole("button", { name: "Close dialog" }).click();
    await p.getByRole("button", { name: "Back to binders" }).click();
    await p.getByRole("button", { name: /ALL ART/ }).click();
    // Fresh mount keeps filter 'owned'; switch all to exercise automatic pagination.
    await p.getByRole("button", { name: "all", exact: true }).click();
    const initial = await p.locator(".binder-slot").count();
    await p
      .locator(".page-scroll")
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    await p.waitForFunction(
      (n) => document.querySelectorAll(".binder-slot").length > n,
      initial,
    );
    const toolbar = await p.locator(".binder-toolbar").boundingBox();
    const scroller = await p.locator(".page-scroll").boundingBox();
    assert(
      Math.abs(toolbar.y - scroller.y) < 3,
      "binder controls remain at scroll top",
    );
    await p.getByRole("button", { name: "VALUE ↓ · OWNED" }).click();
    assert.equal(await p.locator(".binder-slot").count(), 1);
    await p.screenshot({ path: `test-results/mini11-binder-${width}.png` });
    await p.getByRole("button", { name: "VALUE ↓ · OWNED" }).click();
    await p
      .locator(".page-scroll")
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    await p.waitForFunction(
      () => document.querySelectorAll(".binder-slot").length > 48,
    );
    assert.equal(
      await p.evaluate(async () => {
        const cache = await caches.open("packmini-thumbnails-v1");
        return (await cache.keys()).length;
      }),
      662,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 280/390px safe tilt, armed swipes, HAM grading, compact controls, five-column summary, completed close, big hits, highest-copy slot, exact ungraded sale, sticky controls, automatic pagination, owned value sort.",
  );
} finally {
  await browser.close();
  await app.close();
}
