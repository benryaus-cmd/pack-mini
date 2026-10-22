import test from "node:test";
import assert from "node:assert/strict";
import * as recordStore from "../src/services/tradeRecords.ts";
import { tradeDigest, tradeRecordId } from "../src/game/trading.ts";
const terms = {
  id: "a".repeat(20),
  parties: ["alice", "bob"] as [string, string],
  offers: { alice: [], bob: [] },
};
const data = {
  ...terms,
  digest: tradeDigest(terms),
  status: "ready" as const,
  at: 1,
};
const failure = (status: number) =>
  Object.assign(Error("HTTP " + status), { status });
test("missing trading route writes and recovers the same owned journal through social storage", async () => {
  assert.equal(typeof recordStore.TradeRecords, "function");
  const records = new Map();
  const calls: string[] = [];
  const store = new recordStore.TradeRecords(async (path, options) => {
    calls.push((options?.method ?? "GET") + " " + path);
    if (path.includes("/trading/")) throw failure(404);
    if (options?.method === "PUT") {
      const { data, expectedRevision } = JSON.parse(options.body as string);
      assert.equal(expectedRevision, records.get(path)?.revision ?? 0);
      const record = { data, owner: "alice", revision: 1 };
      records.set(path, record);
      return { record };
    }
    if (!records.has(path)) throw failure(404);
    return { record: records.get(path) };
  });
  await store.write(terms, "alice", "ready");
  const read = await store.read(terms.id, "alice");
  assert.equal(read?.data.digest, data.digest);
  assert(
    calls.includes("PUT /data/social/" + tradeRecordId(terms.id, "alice")),
  );
  assert.equal(await store.read(terms.id, "bob"), null);
});
test("storage failures are distinct from missing partner records and never fall back on authentication errors", async () => {
  const calls: string[] = [];
  const store = new recordStore.TradeRecords(async (path, options) => {
    calls.push(path);
    throw failure(options?.method === "PUT" ? 404 : 404);
  });
  await assert.rejects(
    () => store.write(terms, "alice", "ready"),
    (e) =>
      (e as any).definitive === true &&
      /not.*saved|unavailable/i.test((e as Error).message),
  );
  const auth = new recordStore.TradeRecords(async (path) => {
    calls.push(path);
    throw failure(403);
  });
  const before = calls.length;
  await assert.rejects(() => auth.write(terms, "alice", "ready"));
  assert.deepEqual(calls.slice(before), [
    "/data/trading/" + tradeRecordId(terms.id, "alice"),
  ]);
});
test("existing matching ready/completed records are monotonic and revision conflicts are reconciled", async () => {
  let puts = 0;
  const store = new recordStore.TradeRecords(async (path, options) => {
    if (options?.method === "PUT") {
      puts++;
      throw failure(409);
    }
    return {
      record: {
        owner: "alice",
        data: { ...data, status: puts ? "completed" : "ready" },
        revision: 1,
      },
    };
  });
  await store.write(terms, "alice", "ready");
  assert.equal(puts, 0);
  await assert.rejects(
    () => store.write(terms, "alice", "cancelled"),
    /confirm|ready|completed/i,
  );
  const completed = new recordStore.TradeRecords(async (_path, options) => {
    if (options?.method === "PUT") {
      puts++;
      if (puts === 1) throw failure(409);
      return {};
    }
    return {
      record: {
        owner: "alice",
        data: { ...data, status: puts ? "completed" : "ready" },
        revision: 1,
      },
    };
  });
  await completed.write(terms, "alice", "completed");
  assert.equal(puts, 1);
});
