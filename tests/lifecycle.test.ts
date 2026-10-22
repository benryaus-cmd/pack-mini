import { test } from "node:test";
import assert from "node:assert/strict";
import { Multiplayer, ApiError } from "../src/services/multiplayer.ts";
// All lifecycle tests are isolated from the network. Individual cases may
// replace this in-memory responder and restore it afterward.
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ version: 3, store: [] }))) as typeof fetch;
const deferred = () => {
  let resolve!: (x: any) => void;
  const promise = new Promise<any>((r) => (resolve = r));
  return { promise, resolve };
};
const collector = (id = "a_1") => ({
  profile: { playerId: id, username: "Tester", nickName: "Tester", avatar: "" },
  level: 1,
  cards: 5,
  unique: 5,
  showcase: [],
});
class Socket {
  sent: string[] = [];
  readyState = 1;
  onmessage: any;
  onclose: any;
  onerror: any;
  onopen: any;
  constructor(_url: string) {}
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.readyState = 3;
  }
}
(globalThis as any).WebSocket = Socket;
test("old room chat response cannot merge after a new connection", async () => {
  const net = new Multiplayer(),
    wait = deferred();
  net.request = async () => wait.promise;
  const old = net.history();
  net.connect("http://127.0.0.1:18789", "newroom");
  wait.resolve({
    messages: [
      { id: "old", playerId: "a_1", name: "A", text: "Old room", at: 1 },
    ],
  });
  await old;
  assert.equal(net.snapshot().messages.length, 0);
  net.disconnect();
});
test("stale discovery cannot mark another host discovered", async () => {
  const net = new Multiplayer(),
    wait = deferred();
  net.request = async () => wait.promise;
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ old: true }))) as typeof fetch;
  const old = net.discover();
  net.disconnect();
  net.host = "http://127.0.0.1:18790";
  wait.resolve({ old: true });
  await old;
  assert.equal(net.snapshot().discovered, false);
  globalThis.fetch = original;
  net.disconnect();
});
test("publish stops before score when identity changes during record write", async () => {
  const net = new Multiplayer(),
    wait = deferred(),
    putStarted = deferred();
  const calls: string[] = [];
  net.setCollector(collector());
  net.discover = async () => {};
  net.request = async (path: string) => {
    calls.push(path);
    if (path.startsWith("/data/") && !calls.includes("put")) {
      calls.push("put");
      return { record: { revision: 1 } };
    }
    if (path.startsWith("/data/")) {
      putStarted.resolve(null);
      return wait.promise;
    }
    return { ok: true };
  };
  const publish = net.publish().catch(() => {});
  await putStarted.promise;
  net.setCollector(collector("a_2"));
  wait.resolve({ ok: true });
  await publish;
  assert(!calls.includes("/scores"));
  net.disconnect();
});

test("HTTP 401/507 provide recoverable errors and 429 suppresses immediate retries", async () => {
  const original = globalThis.fetch;
  const net = new Multiplayer();
  net.setCollector(collector());
  let calls = 0;
  try {
    for (const code of [401, 507]) {
      globalThis.fetch = (async () => {
        calls++;
        return new Response("{}", { status: code });
      }) as typeof fetch;
      await assert.rejects(
        net.request("/scores", { method: "POST", body: "{}" }),
        (e: unknown) => e instanceof ApiError && e.status === code,
      );
    }
    globalThis.fetch = (async () => {
      calls++;
      return new Response("{}", {
        status: 429,
        headers: { "Retry-After": "10" },
      });
    }) as typeof fetch;
    await assert.rejects(
      net.request("/scores"),
      (e: unknown) => e instanceof ApiError && e.status === 429,
    );
    const before = calls;
    await assert.rejects(
      net.request("/scores"),
      (e: unknown) => e instanceof ApiError && e.status === 429,
    );
    assert.equal(calls, before);
  } finally {
    globalThis.fetch = original;
    net.disconnect();
  }
});

test("relay burst is queued so a profile refresh cannot drop a rare pull", async () => {
  const net = new Multiplayer();
  net.discover = async () => {};
  net.connect("http://127.0.0.1:18789");
  const ws = (net as any).socket as Socket;
  net.send("hello", collector());
  net.send("pull", { id: "pull1", cardId: "base1-4" });
  await new Promise((r) => setTimeout(r, 180));
  assert.equal(ws.sent.length, 2);
  assert.equal(JSON.parse(ws.sent[1]).event, "pull");
  net.disconnect();
});
