import type { Save } from "./types.ts";
import { lockedTradeIds } from "./trading.ts";
export const hamMultiplier = (grade?: 7 | 8 | 9 | 10) =>
  grade === 7
    ? 0.3
    : grade === 8
      ? 0.7
      : grade === 9
        ? 1
        : grade === 10
          ? 2
          : 0.5;
/** One free immutable roll per physical instance. 7:35%, 8:35%, 9:25%, 10:5%. */
export function gradeCard(s: Save, id: string, rng = Math.random): Save {
  const c = s.owned.find((c) => c.instanceId === id);
  if (!c) throw Error("Card not owned");
  if (c.ham) return s;
  if (lockedTradeIds(s).has(id))
    throw Error("Finish this confirmed trade before grading");
  const r = rng();
  if (!Number.isFinite(r) || r < 0 || r >= 1)
    throw Error("Grading unavailable");
  const ham = r < 0.35 ? 7 : r < 0.7 ? 8 : r < 0.95 ? 9 : 10;
  return {
    ...s,
    owned: s.owned.map((c) => (c.instanceId === id ? { ...c, ham } : c)),
  };
}
