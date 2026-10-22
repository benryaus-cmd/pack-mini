import { useEffect, useState } from "react";
import type { Finish, Save } from "../game/types";
import { cardById } from "../game/catalogue.ts";
export interface CardPrice {
  amount: number;
  currency: "USD" | "EUR";
  source: "TCGplayer" | "Cardmarket";
  updated?: string;
  variant: string;
  estimated?: boolean;
}
const obj = (v: any): Record<string, any> =>
  v && typeof v === "object" ? v : {};
export function parseCardPrice(
  value: unknown,
  finish: Finish,
): CardPrice | null {
  const pricing = obj(obj(value).pricing),
    tcg = obj(pricing.tcgplayer);
  const desired =
    finish === "reverse"
      ? ["reverse-holofoil"]
      : finish === "matte" || finish === "gloss"
        ? ["normal", "holofoil"]
        : ["holofoil", "normal"];
  for (const variant of desired) {
    const v = obj(tcg[variant]);
    if (
      typeof v.marketPrice === "number" &&
      v.marketPrice > 0 &&
      Number.isFinite(v.marketPrice)
    )
      return {
        amount: v.marketPrice,
        currency: "USD",
        source: "TCGplayer",
        variant,
        updated: typeof tcg.updated === "string" ? tcg.updated : undefined,
      };
  }
  if (finish === "reverse") return null;
  const cm = obj(pricing.cardmarket),
    amount =
      finish !== "matte" && finish !== "gloss" && cm["trend-holo"] > 0
        ? cm["trend-holo"]
        : cm.trend;
  return typeof amount === "number" && amount > 0 && Number.isFinite(amount)
    ? {
        amount,
        currency: "EUR",
        source: "Cardmarket",
        variant: "card trend",
        updated: typeof cm.updated === "string" ? cm.updated : undefined,
      }
    : null;
}
/** Fall back within the same physical card's available variants before another printing. */
export function parseAnyPrice(value: unknown): CardPrice | null {
  const v = obj(value),
    pricing = obj(v.pricing),
    tcg = obj(pricing.tcgplayer);
  for (const [name, variant] of Object.entries(tcg))
    for (const key of ["marketPrice", "midPrice", "lowPrice"]) {
      const n = obj(variant)[key];
      if (typeof n === "number" && Number.isFinite(n) && n > 0)
        return {
          amount: n,
          currency: "USD",
          source: "TCGplayer",
          variant: `${name} reference`,
          estimated: true,
        };
    }
  const cm = obj(pricing.cardmarket);
  for (const key of [
    "trend",
    "trend-holo",
    "avg",
    "avg7",
    "avg30",
    "low",
    "low-holo",
  ]) {
    const n = cm[key];
    if (typeof n === "number" && Number.isFinite(n) && n > 0)
      return {
        amount: n,
        currency: "EUR",
        source: "Cardmarket",
        variant: `${key} reference`,
        estimated: true,
      };
  }
  for (const variant of Array.isArray(v.variants_detailed)
    ? v.variants_detailed
    : []) {
    const p = parseAnyPrice({ pricing: variant.pricing });
    if (p) return p;
  }
  return null;
}
let active = 0;
const queue: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}
const requests = new Map<string, Promise<any>>();
function fetchPrint(language: string, id: string) {
  const key = language + ":" + id;
  if (!requests.has(key))
    requests.set(
      key,
      limited(async () => {
        try {
          const r = await fetch(
            `https://api.tcgdex.net/v2/${language}/cards/${encodeURIComponent(id)}`,
            { signal: AbortSignal.timeout(9000) },
          );
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        }
      }),
    );
  return requests.get(key)!;
}
export function fetchCardPricing(id: string) {
  const c = cardById.get(id);
  return fetchPrint(c?.language ?? "en", c?.apiId ?? id);
}
const quotes = new Map<string, Promise<CardPrice | null>>();
const quoteTimes = new Map<string, number>();
export function resolveCardPrice(id: string, finish: Finish = "matte") {
  const key = id + ":" + finish;
  if (Date.now() - (quoteTimes.get(key) ?? 0) > 60000) {
    quotes.delete(key);
    const c = cardById.get(id);
    requests.delete((c?.language ?? "en") + ":" + (c?.apiId ?? id));
  }
  quoteTimes.set(key, Date.now());
  if (!quotes.has(key))
    quotes.set(
      key,
      (async () => {
        const c = cardById.get(id),
          raw = await fetchCardPricing(id);
        const exact = parseCardPrice(raw, finish);
        if (exact) return exact;
        const variant = parseAnyPrice(raw);
        if (variant) return variant;
        const aliases = [...(c?.aliases ?? [])]
          .sort(
            (a, b) => Number(b.language === "en") - Number(a.language === "en"),
          )
          .slice(0, 8);
        for (const alias of aliases) {
          const raw = await fetchPrint(alias.language, alias.apiId),
            p = parseCardPrice(raw, finish) ?? parseAnyPrice(raw);
          if (p)
            return {
              ...p,
              variant: "same-art printing reference",
              estimated: true,
            };
        }
        return null;
      })(),
    );
  return quotes.get(key)!;
}
export function useCardPrice(id?: string, finish: Finish = "matte") {
  const [state, setState] = useState<{
    id?: string;
    finish: Finish;
    price: CardPrice | null;
    loading: boolean;
  }>({ id, finish, price: null, loading: !!id });
  useEffect(() => {
    let alive = true;
    if (!id) return;
    setState({ id, finish, price: null, loading: true });
    void resolveCardPrice(id, finish).then((price) => {
      if (alive) setState({ id, finish, price, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [id, finish]);
  return state.id === id && state.finish === finish
    ? state
    : { price: null, loading: !!id };
}
export function useCollectionValue(s: Save) {
  const key = s.owned
    .map((c) => c.cardId + ":" + c.finish)
    .sort()
    .join("|");
  const [state, setState] = useState({
    usd: 0,
    eur: 0,
    unknown: s.owned.length,
    loading: !!s.owned.length,
  });
  useEffect(() => {
    let alive = true;
    const counts = new Map<
      string,
      { id: string; finish: Finish; count: number }
    >();
    for (const o of s.owned) {
      const k = o.cardId + ":" + o.finish,
        old = counts.get(k);
      counts.set(k, {
        id: o.cardId,
        finish: o.finish,
        count: (old?.count ?? 0) + 1,
      });
    }
    let usd = 0,
      eur = 0,
      unknown = s.owned.length;
    setState({ usd, eur, unknown, loading: !!unknown });
    void Promise.all(
      [...counts.values()].map(async (c) => {
        const p = await resolveCardPrice(c.id, c.finish);
        if (p) {
          if (p.currency === "USD") usd += p.amount * c.count;
          else eur += p.amount * c.count;
          unknown -= c.count;
        }
        if (alive) setState({ usd, eur, unknown, loading: true });
      }),
    ).then(() => {
      if (alive) setState({ usd, eur, unknown, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
}
export const formatCardPrice = (p: CardPrice) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: p.currency,
  }).format(p.amount);
export async function saleQuote(
  id: string,
  finish: Finish,
  ham?: 7 | 8 | 9 | 10,
) {
  const price = await resolveCardPrice(id, finish);
  if (!price)
    throw Error(
      "No market reference yet. Try again when pricing is available.",
    );
  let usd = price.amount,
    fx = "";
  if (price.currency === "EUR") {
    const r = await fetch(
      "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) throw Error("USD conversion unavailable");
    const f = await r.json();
    if (!(f.rates?.USD > 0)) throw Error("USD conversion unavailable");
    usd *= f.rates.USD;
    fx = ` · EUR→USD ${f.date}`;
  }
  const { creditsForMarket } = await import("../game/selling");
  return {
    cardId: id,
    finish,
    ham,
    marketUsd: usd,
    credits: creditsForMarket(usd, ham),
    at: Date.now(),
    source: price.source,
    reference: `${price.variant}${fx}`,
  } as import("../game/selling").SaleQuote;
}
