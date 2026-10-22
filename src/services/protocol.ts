import type { Profile } from "../game/types.ts";
export const DEFAULT_HOST =
  "https://particular-gasoline-corrected-declared.trycloudflare.com";
export const GAME = "game2";
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
  avatar?: string;
}
export interface Collector {
  badges?: string[];
  showcaseCards?: {
    cardId: string;
    finish: import("../game/types.ts").Finish;
    ham?: 7 | 8 | 9 | 10;
  }[];
  profile: Profile;
  level: number;
  cards: number;
  unique: number;
  showcase: string[];
}
export const gamePath = (
  type: "api" | "ws",
  host = DEFAULT_HOST,
  room = "lobby",
) =>
  type === "api"
    ? `${host}/api/v1/games/${GAME}`
    : `${host.replace(/^http/, "ws")}/ws/${GAME}/${/^[a-zA-Z0-9_-]{1,32}$/.test(room) ? room : "lobby"}`;
export function profileHeader(p: Profile) {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function mergeMessages(a: ChatMessage[], b: unknown[]): ChatMessage[] {
  const valid = (m: any): m is ChatMessage =>
    m &&
    typeof m.id === "string" &&
    typeof m.playerId === "string" &&
    typeof m.text === "string" &&
    typeof m.name === "string" &&
    Number.isFinite(m.at) &&
    m.text.length <= 280;
  return [...new Map([...a, ...b.filter(valid)].map((m) => [m.id, m])).values()]
    .sort((x, y) => x.at - y.at)
    .slice(-50);
}
export function parseHello(v: unknown): Collector | null {
  if (!v || typeof v !== "object") return null;
  const x = v as any,
    p = x.profile;
  if (
    !p ||
    typeof p.playerId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,40}$/.test(p.playerId) ||
    typeof p.username !== "string" ||
    !Number.isSafeInteger(x.cards) ||
    x.cards < 0 ||
    x.cards > 1000000
  )
    return null;
  return {
    profile: {
      playerId: p.playerId,
      username: p.username.slice(0, 40),
      nickName:
        typeof p.nickName === "string"
          ? p.nickName.slice(0, 50)
          : p.username.slice(0, 40),
      avatar:
        typeof p.avatar === "string" && /^https?:\/\//.test(p.avatar)
          ? p.avatar.slice(0, 500)
          : "",
    },
    level:
      Number.isSafeInteger(x.level) && x.level > 0
        ? Math.min(x.level, 10000)
        : 1,
    cards: x.cards,
    unique:
      Number.isSafeInteger(x.unique) && x.unique >= 0
        ? Math.min(x.unique, 1000000)
        : 0,
    showcaseCards: Array.isArray(x.showcaseCards)
      ? x.showcaseCards
          .filter(
            (c: any) =>
              typeof c.cardId === "string" &&
              [
                "matte",
                "gloss",
                "reverse",
                "holo",
                "textured",
                "rainbow",
                "gold",
              ].includes(c.finish) &&
              (c.ham === undefined || [7, 8, 9, 10].includes(c.ham)),
          )
          .slice(0, 3)
      : [],
    badges: Array.isArray(x.badges)
      ? x.badges
          .filter(
            (b: unknown) => typeof b === "string" && /^[a-z]{1,20}$/.test(b),
          )
          .slice(0, 12)
      : [],
    showcase: Array.isArray(x.showcase)
      ? x.showcase
          .filter((s: unknown) => typeof s === "string" && s.length < 50)
          .slice(0, 3)
      : [],
  };
}
export function recordLimit(schema: unknown, name: string) {
  if (!schema || typeof schema !== "object") return 512;
  const doc = schema as any;
  const record =
    (Array.isArray(doc.store)
      ? doc.store.find((item: any) => item && item.name === name)
      : null) ??
    doc.schemas?.[name] ??
    doc[name];
  const size =
    record?.maxBytes ?? record?.maxBytesPerRecord ?? record?.maxRecordBytes;
  return Number.isSafeInteger(size) && size > 0 ? size : 512;
}
