import type { OwnedCard } from "./types.ts";
export type SocialCard = Pick<
  OwnedCard,
  "instanceId" | "cardId" | "finish" | "ham"
>;
export type Reaction = "like" | "wow" | "love" | "sad";
export const reactions: { id: Reaction; emoji: string; label: string }[] = [
  { id: "like", emoji: "👍", label: "Like" },
  { id: "wow", emoji: "😮", label: "Wow" },
  { id: "love", emoji: "❤️", label: "Love" },
  { id: "sad", emoji: "😢", label: "Sad" },
];
export type SocialEntry = {
  id: string;
  player: string;
  at: number;
  room: string;
  kind: "vote" | "post" | "offer" | "reaction" | "retire";
  before?: number;
  keep?: string[];
  message?: string;
  vote?: 1 | -1 | 0;
  parent?: string;
  target?: string;
  device?: string;
  receive?: SocialCard[];
  cards?: SocialCard[];
  mode?: "showcase" | "trade";
  withdrawn?: boolean;
  reaction?: Reaction;
  active?: boolean;
  name?: string;
  avatar?: string;
};
export function mergeSocial(a: SocialEntry[], b: SocialEntry[]) {
  const by = new Map<string, SocialEntry>();
  for (const e of [...a, ...b]) {
    const key =
      e.kind === "retire"
        ? `floor:${e.player}`
        : e.kind === "vote"
          ? `v:${e.player}:${e.message}`
          : e.kind === "reaction"
            ? `r:${e.player}:${e.message}:${e.reaction}`
            : `p:${e.player}:${e.id}`;
    const old = by.get(key);
    if (old?.withdrawn) continue;
    if (
      !old ||
      e.withdrawn ||
      (e.kind === "retire"
        ? (old.before ?? 0) <= (e.before ?? 0)
        : old.at <= e.at)
    )
      by.set(key, e);
  }
  return retainSocial([...by.values()], 400, false);
}
/** Keep removals outside rolling message history. Compact old removals to an
 * author cutoff: already-retired history cannot be reintroduced by stale peers. */
export function retainSocial(
  entries: SocialEntry[],
  limit = 48,
  compactAuthor = true,
): SocialEntry[] {
  const floors = new Map<string, SocialEntry>();
  for (const e of entries.filter((e) => e.kind === "retire")) {
    if ((floors.get(e.player)?.before ?? 0) <= (e.before ?? 0))
      floors.set(e.player, e);
  }
  const removals: SocialEntry[] = [];
  const players = new Set(
    entries.filter((e) => e.withdrawn).map((e) => e.player),
  );
  for (const player of players) {
    const removed = entries
      .filter((e) => e.player === player && e.withdrawn)
      .sort((a, b) => a.at - b.at);
    if (compactAuthor && removed.length > 16) {
      const cutoff = removed[removed.length - 17];
      const before = Math.max(cutoff.at, floors.get(player)?.before ?? 0);
      const previous = floors.get(player);
      const removedIds = new Set(removed.map((e) => e.id));
      const keep = entries
        .filter(
          (e) =>
            e.player === player &&
            e.kind === "post" &&
            !e.withdrawn &&
            !removedIds.has(e.id) &&
            (e.at > (previous?.before ?? -Infinity) ||
              previous?.keep?.includes(e.id)),
        )
        .sort((a, b) => a.at - b.at)
        .slice(-limit)
        .map((e) => e.id);
      floors.set(player, {
        id: "retired-posts",
        kind: "retire",
        player,
        room: cutoff.room,
        at: before,
        before,
        keep,
      });
    }
    removals.push(
      ...removed
        .filter((e) => e.at > (floors.get(player)?.before ?? -Infinity))
        .map((e) => ({
          id: e.id,
          player: e.player,
          room: e.room,
          at: e.at,
          kind: "post" as const,
          withdrawn: true,
        })),
    );
  }
  const active = entries
    .filter(
      (e) =>
        !e.withdrawn &&
        e.kind !== "retire" &&
        (e.kind !== "post" ||
          e.at > (floors.get(e.player)?.before ?? -Infinity) ||
          floors.get(e.player)?.keep?.includes(e.id)),
    )
    .sort((a, b) => a.at - b.at)
    .slice(-limit);
  if (compactAuthor)
    for (const [player, floor] of floors) {
      const keep = floor.keep?.filter((id) =>
        active.some((e) => e.player === player && e.id === id),
      );
      floors.set(player, { ...floor, keep });
    }
  return [...floors.values(), ...removals, ...active].sort(
    (a, b) => a.at - b.at,
  );
}
export function livePosts(entries: SocialEntry[]) {
  const floors = new Map<string, SocialEntry>();
  for (const e of entries)
    if (
      e.kind === "retire" &&
      (floors.get(e.player)?.before ?? -Infinity) <= (e.before ?? 0)
    )
      floors.set(e.player, e);
  return entries.filter(
    (e) =>
      e.kind === "post" &&
      !e.withdrawn &&
      (e.at > (floors.get(e.player)?.before ?? -Infinity) ||
        floors.get(e.player)?.keep?.includes(e.id)),
  );
}
