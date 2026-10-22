import type { TradeJournal } from "./trading.ts";
export interface CardDefinition {
  apiId?: string;
  language?: "en" | "ja";
  species?: string;
  dexId?: number;
  artId?: string;
  promo?: boolean;
  setName?: string;
  aliases?: { apiId: string; language: "en" | "ja"; image: string }[];
  id: string;
  localId: string;
  name: string;
  image: string;
  setId: string;
  rarity: string;
  tier: number;
  type: string;
  holo: boolean;
}
export type Finish =
  "matte" | "gloss" | "reverse" | "holo" | "textured" | "rainbow" | "gold";
export interface CardVariant {
  id: string;
  finish: Finish;
  prototype: boolean;
}
export interface SetDefinition {
  id: string;
  name: string;
  era: string;
  title: string;
  price: number;
  color: string;
  releaseDate: string;
  logo: string;
  hero: string;
  total: number;
  cards: CardDefinition[];
}
export interface PackSlot {
  name: string;
  minTier: number;
  maxTier: number;
  weighted: boolean;
  reverse?: boolean;
}
export interface PackProduct {
  id: string;
  name: string;
  cost: number;
  count: number;
  packs: number;
  prototypeOdds: boolean;
  slots: PackSlot[];
}
export interface OwnedCard {
  ham?: 7 | 8 | 9 | 10;
  instanceId: string;
  cardId: string;
  setId: string;
  finish: Finish;
  tier: number;
  obtainedAt: number;
  openingId: string;
}
export interface PackOpening {
  productId: string;
  packOrdinal: number;
  packCount: number;
  id: string;
  setId: string;
  instances: string[];
  newIds: string[];
  cursor: number;
  phase: "sealed" | "reveal" | "summary";
  createdAt: number;
}
export interface WalletLedgerEntry {
  id: string;
  delta: number;
  reason: string;
  at: number;
}
export interface MissionProgress {
  id: string;
  label: string;
  target: number;
  value: number;
  reward: number;
  claimed: boolean;
  period: "daily" | "weekly" | "lifetime";
}
export interface Save {
  pendingDrops?: { id: string; seed: number; startedAt: number }[];
  trades?: TradeJournal[];
  version: 1;
  revision: number;
  coins: number;
  xp: number;
  owned: OwnedCard[];
  pending: PackOpening | null;
  queued: PackOpening[];
  lastFreePack: string;
  ledger: WalletLedgerEntry[];
  purchaseIds: string[];
  claims: string[];
  favourites: string[];
  showcase: string[];
  friends: string[];
  daily: { day: string; packs: number; newCards: number; inspections: number };
  weekly: { week: string; packs: number };
  stats: {
    packs: number;
    inspections: number;
    newCards: number;
    bestTier: number;
    studyWins: number;
  };
  lastClaim: string;
  streak: number;
  study: { day: string; count: number; last: number };
}
export interface TradeOffer {
  id: string;
  participants: string[];
  cards: Record<string, string[]>;
  coins: Record<string, number>;
  revision: number;
  confirmations: string[];
  state: "draft" | "confirmed" | "completed" | "cancelled";
}
export interface MarketplaceListing {
  id: string;
  seller: string;
  instanceId: string;
  price: number;
  state: "listed" | "sold" | "cancelled";
}
export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  graphics: "AUTO" | "HIGH" | "LOW";
  reducedMotion: boolean;
  haptics: boolean;
  diagnostics: boolean;
}
export interface Profile {
  playerId: string;
  username: string;
  nickName: string;
  avatar: string;
}
