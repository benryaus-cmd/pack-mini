import type { CardDefinition, Finish } from "./types.ts";
export const foilFinishes: Finish[] = ["holo", "textured", "rainbow", "gold"];
export function finishLabel(finish: Finish) {
  return {
    matte: "Gloss",
    gloss: "Gloss",
    reverse: "Reverse Holo",
    holo: "Holo",
    textured: "Textured Holo",
    rainbow: "Rainbow Holo",
    gold: "Gold Holo",
  }[finish];
}
export function cardLabel(card: CardDefinition, finish: Finish) {
  return `${card.rarity} · ${finishLabel(finish)}`;
}
export function pullFinish(card: CardDefinition, reverse = false): Finish {
  if (reverse && card.variants?.reverse) return "reverse";
  if (card.tier === 6) return "gold";
  if (/rainbow/i.test(card.rarity)) return "rainbow";
  if (card.tier >= 4) return "textured";
  if (card.variants)
    return card.variants.holo && !card.variants.normal ? "holo" : "gloss";
  return card.holo ? "holo" : "gloss";
}
