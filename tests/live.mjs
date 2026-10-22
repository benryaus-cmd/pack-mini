import fs from "node:fs";
const host =
  process.env.PACKVERSE_SERVER ||
  "https://particular-gasoline-corrected-declared.trycloudflare.com";
const results = {
  at: new Date().toISOString(),
  host,
  game: "game2",
  config: null,
  schema: null,
  relay: null,
};
for (const [key, path] of [
  ["config", "/api/v1/games/game2/config"],
  ["schema", "/api/v1/schema"],
]) {
  try {
    const r = await fetch(host + path, { signal: AbortSignal.timeout(12000) });
    results[key] = { status: r.status, body: (await r.text()).slice(0, 24000) };
  } catch (e) {
    results[key] = { error: e.message };
  }
}
try {
  results.relay = await new Promise((resolve) => {
    const a = new WebSocket(
      host.replace(/^http/, "ws") + "/ws/game2/packverse-test",
    );
    let b;
    let t = setTimeout(() => {
      a.close();
      b?.close();
      resolve({ error: "Timed out waiting for two live relay clients" });
    }, 12000);
    a.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "welcome") {
        b = new WebSocket(
          host.replace(/^http/, "ws") + "/ws/game2/packverse-test",
        );
        b.onmessage = (ev) => {
          const v = JSON.parse(ev.data);
          if (v.type === "welcome")
            b.send(
              JSON.stringify({
                type: "event",
                event: "packverse_test",
                data: { nonce: "packverse-live-verification" },
              }),
            );
        };
        b.onerror = () => {
          clearTimeout(t);
          a.close();
          b.close();
          resolve({ error: "Second client could not connect" });
        };
      }
      if (m.type === "event" && m.event === "packverse_test") {
        clearTimeout(t);
        a.close();
        b?.close();
        resolve({
          ok: true,
          verified: "Two independent WebSocket clients exchanged a relay event",
        });
      }
    };
    a.onerror = () => {
      clearTimeout(t);
      a.close();
      resolve({ error: "Live WebSocket request failed" });
    };
  });
} catch (e) {
  results.relay = { error: e.message };
}
fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync("test-results/live.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (!results.relay?.ok) process.exitCode = 2;
