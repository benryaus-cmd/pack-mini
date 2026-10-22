import { createServer } from "vite";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, launchOptions } from "./browser-support.mjs";

// Keep Vite and Chromium in the same process/network namespace. No live assets
// or services are required: the arcade uses the real local IndexedDB store.
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}`;
let browser;
const errors = [];
async function readSave(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("packmini-v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("saves", "readonly");
          const get = transaction
            .objectStore("saves")
            .get(localStorage.getItem("packmini-browser-id"));
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
          get.onerror = () => {
            reject(get.error);
            db.close();
          };
        };
      }),
  );
}
async function openArcade(page) {
  await page.getByRole("button", { name: /EARN CREDITS · PLAY/ }).click();
  await page.getByRole("tab", { name: "LUCKY REELS" }).waitFor();
}
try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://**/*", (route) => route.abort());
  await page.goto(url);
  await openArcade(page);
  await page.getByRole("button", { name: /SPIN.*50/ }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".arcade-strip.is-spinning").length === 3,
  );
  await page.waitForTimeout(150);
  const before = await page
    .locator(".arcade-strip")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).transform),
    );
  await page.waitForTimeout(150);
  const after = await page
    .locator(".arcade-strip")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).transform),
    );
  assert.notDeepEqual(
    before,
    after,
    "The symbol strips must visibly travel while spinning",
  );
  const stopped = "matrix(1, 0, 0, 1, 0, -2496)";
  await page.waitForFunction(
    (expected) =>
      getComputedStyle(document.querySelectorAll(".arcade-strip")[0])
        .transform === expected,
    stopped,
  );
  assert.notEqual(
    await page
      .locator(".arcade-strip")
      .nth(2)
      .evaluate((element) => getComputedStyle(element).transform),
    stopped,
    "First reel must stop before the third reel",
  );
  await page
    .getByRole("button", { name: /SPIN.*50/ })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".arcade-reels")
        ?.getAttribute("aria-label")
        ?.includes("spinning"),
  );
  const reelSave = await readSave(page);
  const reelEntry = reelSave.ledger.find(
    (entry) => entry.arcade?.kind === "slots",
  );
  assert(reelEntry, "Reel result must be persisted before its reveal finishes");
  const finalSymbols = await page
    .locator(".arcade-strip > span:last-child")
    .allTextContents();
  assert.deepEqual(
    finalSymbols,
    reelEntry.arcade.values.map((value) => ["✦", "◈", "●"][value]),
    "All three reels must stop on their persisted result",
  );

  await page.getByRole("tab", { name: "COIN DROP" }).click();
  const initial = await readSave(page);
  await page.getByRole("button", { name: "5 BALLS 250 credits" }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".arcade-ball").length === 5 &&
      document.querySelector(".arcade-live")?.textContent?.startsWith("5 / 5"),
  );
  const launched = await readSave(page);
  assert.equal(
    launched.coins,
    initial.coins - 250,
    "Each ball must be charged before it launches",
  );
  assert.equal(launched.pendingDrops.length, 5);
  const ballY = await page.locator(".arcade-ball").first().getAttribute("cy");
  await page.waitForTimeout(150);
  assert.notEqual(
    await page.locator(".arcade-ball").first().getAttribute("cy"),
    ballY,
    "Live physics must move the ball",
  );
  assert(
    await page.getByRole("button", { name: "1 BALL 50 credits" }).isDisabled(),
    "A sixth simultaneous ball must be blocked",
  );
  fs.mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/arcade-physics-five.png" });

  await page.reload();
  await openArcade(page);
  await page.getByRole("tab", { name: "COIN DROP" }).click();
  const restored = await readSave(page);
  assert(
    restored.pendingDrops.length > 0,
    "Reload must preserve unfinished charged drops",
  );
  assert.equal(
    restored.coins,
    launched.coins,
    "Reload must not charge a pending ball again",
  );
  await page.waitForFunction(
    () =>
      document.querySelector(".arcade-live")?.textContent?.startsWith("0 / 5"),
    undefined,
    { timeout: 30000 },
  );
  const settled = await readSave(page);
  const entries = settled.ledger.filter(
    (entry) => entry.arcade?.kind === "drop",
  );
  assert.equal(
    entries.length,
    5,
    "Each pending drop must produce one settlement",
  );
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 5);
  assert(entries.every((entry) => [0, 80, 120].includes(entry.arcade.payout)));
  assert.equal(
    settled.coins,
    initial.coins -
      250 +
      entries.reduce((sum, entry) => sum + entry.arcade.payout, 0),
  );
  await page.reload();
  await openArcade(page);
  await page.getByRole("tab", { name: "COIN DROP" }).click();
  await page.waitForTimeout(200);
  assert.equal(
    (await readSave(page)).coins,
    settled.coins,
    "A second reload must never grant a second payout",
  );
  assert.deepEqual(errors, [], "The arcade must not throw browser errors");
  console.log(
    JSON.stringify({
      reelsMoving: true,
      sequentialStops: true,
      persistedReelResult: true,
      fiveLivePhysicsBalls: true,
      reloadRecoveredExactlyOnce: true,
      errors,
    }),
  );
} finally {
  await browser?.close();
  await server.close();
}
