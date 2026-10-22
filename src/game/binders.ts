import type { CardDefinition, Save } from "./types.ts";
export interface Binder {
  id: string;
  name: string;
  icon: string;
  color: string;
  cards: CardDefinition[];
}
export function makeBinders(cards: CardDefinition[]): Binder[] {
  const defs: [
    string,
    string,
    string,
    string,
    (c: CardDefinition) => boolean,
  ][] = [
    ["all", "ALL ART", "✦", "#f5c8ff", () => true],
    ["english", "ENGLISH", "◈", "#9feada", (c) => c.language === "en"],
    ["japanese", "日本語", "桜", "#ffb4ce", (c) => c.language === "ja"],
    [
      "starters",
      "STARTERS",
      "❀",
      "#a7e9af",
      (c) => [1, 4, 7].includes(c.dexId ?? 0),
    ],
    ["rare", "RARE", "◆", "#b0b7ff", (c) => c.tier === 2],
    [
      "double",
      "DOUBLE RARE",
      "✧",
      "#e7b4ff",
      (c) => /double|ultra|rare v|rare gx/i.test(c.rarity) || c.tier === 4,
    ],
    ["holo", "HOLO CLUB", "✺", "#9be7ff", (c) => c.holo],
    ["promo", "PROMO", "★", "#ffd18d", (c) => !!c.promo],
    ["secret", "SECRET SOCIETY", "♛", "#ffe794", (c) => c.tier >= 5],
  ];
  return defs
    .map(([id, name, icon, color, test]) => {
      const seen = new Set<string>();
      return {
        id,
        name,
        icon,
        color,
        cards: cards.filter(test).filter((c) => {
          const key =
            id === "english" || id === "japanese" ? c.id : (c.artId ?? c.id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      };
    })
    .filter((b) => b.cards.length);
}
export function binderOwned(b: Binder, s: Save, definitions: CardDefinition[]) {
  const byId = new Map(definitions.map((c) => [c.id, c]));
  const ids = new Set(s.owned.map((o) => o.cardId));
  const arts = new Set(
    s.owned.map((o) => byId.get(o.cardId)?.artId ?? o.cardId),
  );
  return b.cards.filter((c) =>
    b.id === "english" || b.id === "japanese"
      ? ids.has(c.id)
      : arts.has(c.artId ?? c.id),
  );
}
export function earnedBadges(s: Save, cards: CardDefinition[]) {
  return makeBinders(cards)
    .filter(
      (b) =>
        b.cards.length && binderOwned(b, s, cards).length === b.cards.length,
    )
    .map((b) => b.id);
}
export function badgesLost(s: Save, ids: string[], cards: CardDefinition[]) {
  const after = {
    ...s,
    owned: s.owned.filter((o) => !ids.includes(o.instanceId)),
  };
  const keep = new Set(earnedBadges(after, cards));
  return earnedBadges(s, cards).filter((b) => !keep.has(b));
}
