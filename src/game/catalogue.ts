import bundled from "./mini-cards.json" with { type: "json" };
import type { SetDefinition, CardDefinition } from "./types.ts";
export const allCards = bundled as CardDefinition[];
export const cardById = new Map(allCards.map((c) => [c.id, c]));
const definitions = [
  {
    id: "mini-all",
    name: "ALL STARS",
    title: "ALL",
    price: 1000,
    color: "#eeb7ff",
    hero: "Charizard",
    test: (_: CardDefinition) => true,
  },
  {
    id: "mini-en",
    name: "ENGLISH CLUB",
    title: "ENGLISH",
    price: 1200,
    color: "#91edda",
    hero: "Pikachu",
    test: (c: CardDefinition) => c.language === "en",
  },
  {
    id: "mini-ja",
    name: "JAPAN CLUB",
    title: "JAPANESE",
    price: 1500,
    color: "#ffb6d0",
    hero: "Umbreon",
    test: (c: CardDefinition) => c.language === "ja",
  },
  {
    id: "mini-starters",
    name: "FIRST FRIENDS",
    title: "STARTERS",
    price: 800,
    color: "#f4d18e",
    hero: "Bulbasaur",
    test: (c: CardDefinition) => [1, 4, 7].includes(c.dexId ?? 0),
  },
];
export const sets: SetDefinition[] = definitions.map((p) => {
  const cards = allCards.filter(p.test);
  return {
    id: p.id,
    name: p.name,
    title: p.title,
    price: p.price,
    color: p.color,
    era: "Mini",
    releaseDate: "2026-10-22",
    logo: "",
    hero:
      cards.find((c) => c.species === p.hero && c.tier >= 3)?.id ??
      cards[0]?.id,
    total: cards.length,
    cards,
  };
});
const originals = [...new Set(allCards.map((c) => c.setId))].map((id) => {
  const cards = allCards.filter((c) => c.setId === id);
  return {
    id,
    name: cards[0].setName ?? id,
    era: "Mini",
    title: id,
    price: 1000,
    color: "#eeccff",
    releaseDate: "",
    logo: "",
    hero: cards[0].id,
    total: cards.length,
    cards,
  };
});
export const setById = new Map([...sets, ...originals].map((s) => [s.id, s]));
export const totalCards = allCards.length;
export const heroCard = (s: SetDefinition) =>
  cardById.get(s.hero) ?? s.cards[0];
export const imageUrl = (c: CardDefinition, large = false) =>
  c.image ? `${c.image}/${large ? "high" : "low"}.webp` : "";
export async function refreshSet(id: string, signal?: AbortSignal) {
  const r = await fetch(
    `https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(id)}`,
    { signal },
  );
  if (!r.ok) throw Error("Catalogue unavailable");
  return r.json();
}
