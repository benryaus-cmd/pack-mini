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
    ["reverse", "REVERSE HOLOS", "◈", "#9feada", (c) => !!c.variants?.reverse],
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
export function binderAcceptsFinish(
  id: string,
  finish: import("./types.ts").Finish,
) {
  return id === "reverse"
    ? finish === "reverse"
    : id === "holo"
      ? ["holo", "textured", "rainbow", "gold"].includes(finish)
      : true;
}
export function binderOwned(b: Binder, s: Save, definitions: CardDefinition[]) {
  const byId = new Map(definitions.map((c) => [c.id, c]));
  return b.cards.filter((c) =>
    s.owned.some((o) => {
      const def = byId.get(o.cardId);
      const same =
        b.id === "japanese"
          ? o.cardId === c.id
          : (def?.artId ?? o.cardId) === (c.artId ?? c.id);
      return same && binderAcceptsFinish(b.id, o.finish);
    }),
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
