import { hamMultiplier } from "./grading.ts";
import type { Save, Finish } from "./types.ts";
import { lockedTradeIds } from "./trading.ts";
export interface SaleQuote {
  ham?: 7 | 8 | 9 | 10;
  cardId: string;
  finish: Finish;
  marketUsd: number;
  credits: number;
  at: number;
  source: string;
  reference: string;
}
export const creditsForMarket = (usd: number, ham?: 7 | 8 | 9 | 10) =>
  Number.isFinite(usd) && usd >= 0
    ? Math.floor(usd * 100 * hamMultiplier(ham) + 1e-8)
    : 0;
export function sellCard(
  s: Save,
  id: string,
  quote: SaleQuote,
  now = Date.now(),
): Save {
  const own = s.owned.find((c) => c.instanceId === id);
  if (!own) throw Error("Card already sold or traded");
  if (lockedTradeIds(s).has(id))
    throw Error("Card reserved for a confirmed trade");
  if (
    s.pending?.instances.includes(id) ||
    s.queued.some((p) => p.instances.includes(id))
  )
    throw Error("Finish revealing this pack first");
  if (
    !Number.isFinite(quote.at) ||
    quote.cardId !== own.cardId ||
    quote.finish !== own.finish ||
    !Number.isFinite(quote.marketUsd) ||
    quote.marketUsd < 0 ||
    quote.ham !== own.ham ||
    quote.credits !== creditsForMarket(quote.marketUsd, own.ham) ||
    !Number.isSafeInteger(quote.credits) ||
    quote.credits < 1
  )
    throw Error("A current market quote is required");
  if (now - quote.at > 600000 || quote.at - now > 60000)
    throw Error("Quote expired. Check the market again");
  return {
    ...s,
    coins: s.coins + quote.credits,
    owned: s.owned.filter((c) => c.instanceId !== id),
    favourites: s.favourites.filter((x) => x !== id),
    showcase: s.showcase.filter((x) => x !== id),
    ledger: [
      {
        id: "sale_" + id,
        delta: quote.credits,
        reason: "Sold card · HAM market reference",
        at: now,
      },
      ...s.ledger,
    ].slice(0, 300),
  };
}
