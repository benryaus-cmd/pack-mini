import type { Save, WalletLedgerEntry } from "./types.ts";
import { DROP_PAYOUTS, simulateDrop } from "./plinko.ts";
export const ARCADE_STAKE = 50;
export type ArcadeKind = "slots" | "drop";
export interface ArcadeResult {
  kind: ArcadeKind;
  values: number[];
  payout: number;
}
export interface PendingDrop {
  id: string;
  seed: number;
  startedAt: number;
}
type DropSave = Save & { pendingDrops?: PendingDrop[] };
type ArcadeLedgerEntry = WalletLedgerEntry & { arcade?: ArcadeResult };
const prefix = "arcade:";
function validateId(id: string) {
  if (!id || id.length > 120) throw Error("Invalid arcade transaction");
}
function draw(rng: () => number, size: number) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw Error("Random source unavailable");
  return Math.floor(value * size);
}
export function startDrop(
  save: DropSave,
  id: string,
  now = Date.now(),
  rng = Math.random,
): DropSave {
  validateId(id);
  if (save.purchaseIds.includes(prefix + id)) return save;
  if ((save.pendingDrops?.length ?? 0) >= 5)
    throw Error("Five balls are already in play");
  if (save.coins < ARCADE_STAKE)
    throw Error("Not enough credits. Try Collector’s Eye for free.");
  const pending = { id, seed: draw(rng, 0x100000000), startedAt: now };
  return {
    ...save,
    coins: save.coins - ARCADE_STAKE,
    pendingDrops: [...(save.pendingDrops ?? []), pending],
    purchaseIds: [...save.purchaseIds, prefix + id],
    ledger: [
      {
        id: prefix + id,
        delta: -ARCADE_STAKE,
        reason: "Coin drop · ball launched · 50 credit stake",
        at: now,
      },
      ...save.ledger,
    ].slice(0, 300),
  };
}
/** Re-simulating the persisted seed verifies the bin; callers cannot choose their payout. */
export function settleDrop(
  save: DropSave,
  id: string,
  now = Date.now(),
): DropSave {
  const pending = save.pendingDrops?.find((ball) => ball.id === id);
  if (!pending) return save;
  const bin = simulateDrop(pending.seed);
  const payout = DROP_PAYOUTS[bin];
  const entry: ArcadeLedgerEntry = {
    id: prefix + id,
    delta: payout - ARCADE_STAKE,
    reason: `Coin drop · ${payout} payout / 50 stake`,
    at: now,
    arcade: { kind: "drop", values: [bin], payout },
  };
  return {
    ...save,
    coins: save.coins + payout,
    pendingDrops: save.pendingDrops!.filter((ball) => ball.id !== id),
    ledger: [
      entry,
      ...save.ledger.filter((row) => row.id !== prefix + id),
    ].slice(0, 300),
  };
}
export function recoverDrops(save: DropSave): DropSave {
  return (save.pendingDrops ?? []).reduce(
    (next, ball) => settleDrop(next, ball.id),
    save,
  );
}
/** Reels settle atomically before their sequential animated reveal. */
export function playArcade(
  save: DropSave,
  kind: ArcadeKind,
  id: string,
  now = Date.now(),
  rng = Math.random,
): DropSave {
  validateId(id);
  if (save.purchaseIds.includes(prefix + id)) return save;
  if (kind === "drop") return startDrop(save, id, now, rng);
  if (kind !== "slots") throw Error("Unknown arcade game");
  if (save.coins < ARCADE_STAKE)
    throw Error("Not enough credits. Try Collector’s Eye for free.");
  const values = Array.from({ length: 3 }, () => draw(rng, 3));
  const unique = new Set(values).size;
  const payout = unique === 1 ? 150 : unique === 2 ? 60 : 0;
  const entry: ArcadeLedgerEntry = {
    id: prefix + id,
    delta: payout - ARCADE_STAKE,
    reason: `Lucky reels · ${payout} payout / 50 stake`,
    at: now,
    arcade: { kind, values, payout },
  };
  return {
    ...save,
    coins: save.coins - ARCADE_STAKE + payout,
    purchaseIds: [...save.purchaseIds, prefix + id],
    ledger: [entry, ...save.ledger].slice(0, 300),
  };
}
export function arcadeResult(save: Save, id: string): ArcadeResult | undefined {
  return (
    save.ledger.find((entry) => entry.id === prefix + id) as
      ArcadeLedgerEntry | undefined
  )?.arcade;
}

/** One persisted batch is one play, even when its balls settle out of order. */
export function startDropBatch(
  save: Save,
  ids: string[],
  now = Date.now(),
  rng = Math.random,
): Save {
  if (save.pendingDrops?.length)
    throw Error("Finish this batch before playing again");
  if (!ids.length || ids.length > 5 || new Set(ids).size !== ids.length)
    throw Error("Choose one to five different balls");
  ids.forEach(validateId);
  if (ids.some((id) => save.purchaseIds.includes(prefix + id)))
    throw Error("Batch already played");
  if (save.coins < ids.length * ARCADE_STAKE) throw Error("Not enough credits");
  let next = save;
  for (const id of ids) next = startDrop(next, id, now, rng);
  return { ...next, dropBatch: { ids: [...ids], startedAt: now } };
}
export function dropBatchResult(save: Save) {
  // Older saves still resume their individually charged pending balls.
  const ids = save.dropBatch?.ids ?? save.pendingDrops?.map((b) => b.id) ?? [];
  if (!ids.length) return undefined;
  const results = ids
    .map((id) => arcadeResult(save, id))
    .filter((r): r is ArcadeResult => !!r);
  const payout = results.reduce((n, r) => n + r.payout, 0);
  const stake = ids.length * ARCADE_STAKE;
  return {
    count: ids.length,
    settled: results.length,
    payout,
    stake,
    net: payout - stake,
  };
}
