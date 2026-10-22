import type { OwnedCard, Save } from "./types.ts";
export interface TradeTerms {
  id: string;
  parties: [string, string];
  offers: Record<string, OwnedCard[]>;
}
export interface TradeJournal extends TradeTerms {
  digest: string;
  status: "ready" | "completed" | "cancelled";
  at: number;
}
export function tradeDigest(t: TradeTerms): string {
  const text = JSON.stringify([
    t.id,
    ...[...t.parties]
      .sort()
      .map((p) => [
        p,
        ...(t.offers[p] ?? [])
          .map((c) => [c.instanceId, c.cardId, c.finish, c.tier, c.ham ?? null])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ]),
  ]);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}
export function lockedTradeIds(s: Save): Set<string> {
  return new Set(
    (s.trades ?? [])
      .filter((t) => t.status === "ready")
      .flatMap((t) =>
        Object.values(t.offers)
          .flat()
          .map((c) => c.instanceId),
      ),
  );
}
export function prepareTrade(s: Save, terms: TradeTerms, player: string): Save {
  if (!terms.parties.includes(player) || terms.parties[0] === terms.parties[1])
    throw Error("Invalid trading partners");
  const prior = (s.trades ?? []).find((t) => t.id === terms.id);
  const digest = tradeDigest(terms);
  if (prior) {
    if (prior.status !== "ready") throw Error("This trade has already ended");
    if (prior.digest !== digest) throw Error("Trade terms changed");
    return s;
  }
  if ((s.trades ?? []).some((t) => t.status === "ready"))
    throw Error("Finish your current trade first");
  const mine = terms.offers[player] ?? [];
  const other = terms.offers[terms.parties.find((p) => p !== player)!] ?? [];
  if (!mine.length || !other.length || mine.length > 3 || other.length > 3)
    throw Error("Each collector offers 1–3 cards");
  const ids = mine.map((c) => c.instanceId);
  if (new Set(ids).size !== ids.length) throw Error("A card appears twice");
  const pending = new Set([
    ...(s.pending?.instances ?? []),
    ...s.queued.flatMap((p) => p.instances),
  ]);
  for (const c of mine) {
    const own = s.owned.find((o) => o.instanceId === c.instanceId);
    if (
      !own ||
      JSON.stringify(own) !== JSON.stringify(c) ||
      pending.has(c.instanceId)
    )
      throw Error(
        "An offered card is unavailable. Finish opening its pack first.",
      );
  }
  return {
    ...s,
    trades: [
      ...(s.trades ?? []).slice(-49),
      { ...structuredClone(terms), digest, status: "ready", at: Date.now() },
    ],
  };
}
export function cancelPreparedTrade(
  s: Save,
  id: string,
  terms?: TradeTerms,
): Save {
  if (terms && !(s.trades ?? []).some((t) => t.id === id))
    return {
      ...s,
      trades: [
        ...(s.trades ?? []).slice(-49),
        {
          ...terms,
          digest: tradeDigest(terms),
          status: "cancelled",
          at: Date.now(),
        },
      ],
    };
  return {
    ...s,
    trades: (s.trades ?? []).map((t) =>
      t.id === id && t.status === "ready" ? { ...t, status: "cancelled" } : t,
    ),
  };
}
export function completeTrade(
  s: Save,
  terms: TradeTerms,
  player: string,
): Save {
  const j = (s.trades ?? []).find((t) => t.id === terms.id);
  if (!j || j.digest !== tradeDigest(terms))
    throw Error("Trade was not prepared with these terms");
  if (j.status === "completed") return s;
  if (j.status !== "ready") throw Error("Trade was declined");
  const outgoing = new Set(terms.offers[player].map((c) => c.instanceId));
  if (
    s.owned.filter((c) => outgoing.has(c.instanceId)).length !== outgoing.size
  )
    throw Error("Reserved cards are unavailable");
  const other = terms.parties.find((p) => p !== player)!;
  const incoming = terms.offers[other].map((c, i) => ({
    ...c,
    instanceId: `tr_${terms.id}_${i}`,
    openingId: `trade_${terms.id}`,
    obtainedAt: Date.now(),
  }));
  return {
    ...s,
    owned: [...s.owned.filter((c) => !outgoing.has(c.instanceId)), ...incoming],
    favourites: s.favourites.filter((id) => !outgoing.has(id)),
    showcase: s.showcase.filter((id) => !outgoing.has(id)),
    trades: s.trades!.map((t) =>
      t.id === j.id ? { ...t, status: "completed" } : t,
    ),
  };
}
export const tradeRecordId = (id: string, player: string) =>
  `mt_${id}_${player.slice(-8)}`;
