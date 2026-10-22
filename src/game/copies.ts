import type { OwnedCard } from "./types.ts";
export const copyRank = (card: Pick<OwnedCard, "ham">) =>
  card.ham === 7
    ? 0
    : card.ham === undefined
      ? 1
      : card.ham === 8
        ? 2
        : card.ham === 9
          ? 3
          : 4;
export function bestCopy(cards: OwnedCard[]) {
  return [...cards].sort(
    (a, b) =>
      copyRank(b) - copyRank(a) ||
      b.obtainedAt - a.obtainedAt ||
      a.instanceId.localeCompare(b.instanceId),
  )[0];
}
