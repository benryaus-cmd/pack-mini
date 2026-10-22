import type { PackProduct, PackSlot, SetDefinition } from "./types.ts";
const common = (): PackSlot => ({
  name: "Discovery",
  minTier: 0,
  maxTier: 1,
  weighted: false,
});
const reverse = (): PackSlot => ({
  name: "Prototype reverse finish",
  minTier: 0,
  maxTier: 2,
  weighted: false,
  reverse: true,
});
const rare = (minTier = 2): PackSlot => ({
  name: minTier >= 4 ? "Ultra spotlight" : "Rare spotlight",
  minTier,
  maxTier: 6,
  weighted: true,
});
const standard = [common(), common(), common(), reverse(), rare()];
export const products: PackProduct[] = [
  {
    id: "standard",
    name: "Standard Booster",
    cost: 100,
    count: 5,
    packs: 1,
    prototypeOdds: true,
    slots: standard,
  },
  {
    id: "collector",
    name: "Collector Booster",
    cost: 250,
    count: 7,
    packs: 1,
    prototypeOdds: true,
    slots: [common(), common(), common(), common(), reverse(), rare(), rare()],
  },
  {
    id: "premium",
    name: "Premium Booster",
    cost: 500,
    count: 10,
    packs: 1,
    prototypeOdds: true,
    slots: [
      common(),
      common(),
      common(),
      common(),
      common(),
      common(),
      reverse(),
      rare(),
      rare(),
      rare(4),
    ],
  },
  {
    id: "bundle",
    name: "Generation Bundle",
    cost: 900,
    count: 5,
    packs: 3,
    prototypeOdds: true,
    slots: standard,
  },
  {
    id: "daily",
    name: "Daily Free Pack",
    cost: 0,
    count: 5,
    packs: 1,
    prototypeOdds: true,
    slots: standard,
  },
];
export const productById = (id = "standard") =>
  products.find((p) => p.id === id);
export const productCost = (product: PackProduct, _set: SetDefinition) =>
  product.id === "daily" ? 0 : (_set.price * product.cost) / 100;
export function slotPool(slot: PackSlot, set: SetDefinition) {
  const exact = set.cards.filter(
    (c) => c.tier >= slot.minTier && c.tier <= slot.maxTier,
  );
  if (exact.length) return exact;
  return slot.minTier >= 2 ? set.cards.filter((c) => c.tier >= 2) : set.cards;
}
export function guaranteeLabel(product: PackProduct, set: SetDefinition) {
  return product.id === "premium" && set.cards.some((c) => c.tier >= 4)
    ? "3 rare+ · 1 ultra guaranteed"
    : product.id === "collector"
      ? "2 rare or better guaranteed"
      : product.id === "premium"
        ? "3 rare or better guaranteed"
        : "1 rare or better per pack";
}
