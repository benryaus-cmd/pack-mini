import type { Save, SetDefinition } from "./types.ts";
export interface AchievementProgress {
  id: string;
  label: string;
  detail: string;
  value: number;
  target: number;
  reward: number;
  claimed: boolean;
  setId?: string;
}
export function achievements(
  save: Save,
  catalogue: SetDefinition[],
): AchievementProgress[] {
  const claimed = (id: string) => save.claims.includes("award_" + id);
  const rare = [
    { tier: 3, label: "First foil", reward: 250 },
    { tier: 4, label: "Beyond ordinary", reward: 500 },
    { tier: 5, label: "A secret worth keeping", reward: 1000 },
    { tier: 6, label: "The golden moment", reward: 1500 },
  ].map((a) => ({
    id: "rare_" + a.tier,
    label: a.label,
    detail:
      "Discover a " +
      ["", "", "", "holo", "ultra", "secret", "gold"][a.tier] +
      " rare or better.",
    value: save.stats.bestTier,
    target: a.tier,
    reward: a.reward,
    claimed: claimed("rare_" + a.tier),
  }));
  const milestones = catalogue.flatMap((set) => {
    const valid = new Set(set.cards.map((c) => c.id));
    const count = new Set(
      save.owned.filter((o) => valid.has(o.cardId)).map((o) => o.cardId),
    ).size;
    return [
      { percent: 25, reward: 500 },
      { percent: 50, reward: 1000 },
      { percent: 100, reward: 1500 },
    ].map((m) => {
      const id = "set_" + set.id + "_" + m.percent;
      return {
        id,
        label: set.name + " · " + m.percent + "%",
        detail: "Discover unique printed cards from this set.",
        setId: set.id,
        value: count,
        target: Math.ceil((valid.size * m.percent) / 100),
        reward: m.reward,
        claimed: claimed(id),
      };
    });
  });
  return [...rare, ...milestones];
}
export function claimAchievement(
  save: Save,
  id: string,
  catalogue: SetDefinition[],
  now = Date.now(),
): Save {
  const award = achievements(save, catalogue).find((a) => a.id === id);
  if (!award) throw Error("Unknown achievement");
  if (award.claimed) throw Error("Achievement already claimed");
  if (award.value < award.target) throw Error("Achievement is not ready");
  const key = "award_" + id;
  return {
    ...save,
    coins: save.coins + award.reward,
    claims: [...save.claims, key],
    ledger: [
      { id: key, delta: award.reward, reason: award.label, at: now },
      ...save.ledger,
    ].slice(0, 300),
  };
}
