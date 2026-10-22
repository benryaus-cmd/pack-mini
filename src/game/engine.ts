import { lockedTradeIds } from "./trading.ts";
import { productById, productCost, slotPool } from "./products.ts";
import type {
  Save,
  SetDefinition,
  OwnedCard,
  Finish,
  MissionProgress,
} from "./types.ts";
export const tierNames = [
  "Common",
  "Uncommon",
  "Rare",
  "Holo rare",
  "Ultra rare",
  "Secret rare",
  "Gold rare",
];
export const prototypeWeights: Record<number, number> = {
  2: 0.6,
  3: 0.27,
  4: 0.1,
  5: 0.027,
  6: 0.003,
};
export const utcDay = (now = Date.now()) =>
  new Date(now).toISOString().slice(0, 10);
export const utcWeek = (now = Date.now()) =>
  utcDay(now - ((new Date(now).getUTCDay() + 6) % 7) * 86400000);
export const level = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 100));
export const levelProgress = (xp: number) => {
  const n = level(xp) - 1;
  return (xp - n * n * 100) / ((n + 1) * (n + 1) * 100 - n * n * 100);
};
export function initialSave(now = Date.now()): Save {
  return {
    version: 1,
    revision: 0,
    coins: 5000,
    xp: 0,
    owned: [],
    pending: null,
    queued: [],
    lastFreePack: "",
    ledger: [],
    purchaseIds: [],
    claims: [],
    favourites: [],
    showcase: [],
    friends: [],
    daily: { day: utcDay(now), packs: 0, newCards: 0, inspections: 0 },
    weekly: { week: utcWeek(now), packs: 0 },
    stats: { packs: 0, inspections: 0, newCards: 0, bestTier: 0, studyWins: 0 },
    lastClaim: "",
    streak: 0,
    study: { day: utcDay(now), count: 0, last: 0 },
  };
}
function fresh(save: Save, now: number) {
  const s = structuredClone(save);
  if (s.daily.day !== utcDay(now))
    s.daily = { day: utcDay(now), packs: 0, newCards: 0, inspections: 0 };
  if (s.weekly.week !== utcWeek(now))
    s.weekly = { week: utcWeek(now), packs: 0 };
  return s;
}
function credit(
  s: Save,
  amount: number,
  id: string,
  reason: string,
  now: number,
) {
  s.coins += amount;
  s.ledger.unshift({ id, delta: amount, reason, at: now });
  s.ledger = s.ledger.slice(0, 300);
}
export const cardKey = (c: OwnedCard) => c.cardId + ":" + c.finish;
export function rollTier(available: number[], rng = Math.random): number {
  if (!available.length) throw Error("No rarity pool");
  const weights = available.map((t) => prototypeWeights[t] ?? 1);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < available.length; i++) {
    r -= weights[i];
    if (r < 0) return available[i];
  }
  return available.at(-1)!;
}
function pick<T>(a: T[], rng: () => number): T {
  return a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
}
export function purchase(
  save: Save,
  set: SetDefinition,
  tx: string,
  now = Date.now(),
  rng = Math.random,
  productId = "standard",
): Save {
  if (save.purchaseIds.includes(tx)) return save;
  if (save.pending || save.queued?.length)
    throw Error("Finish your current pack first");
  const product = productById(productId);
  if (!product) throw Error("Unknown pack product");
  const cost = productCost(product, set);
  if (!Number.isSafeInteger(cost) || cost < 0 || save.coins < cost)
    throw Error("Not enough coins");
  if (product.id === "daily" && save.lastFreePack === utcDay(now))
    throw Error("Daily free pack already claimed");
  if (!set.cards.length || !set.cards.some((c) => c.tier >= 2))
    throw Error("Incomplete catalogue. Try another set.");
  const s = fresh(save, now),
    known = new Set(s.owned.map((c) => c.cardId));
  const generated: OwnedCard[] = [];
  const openings: NonNullable<Save["pending"]>[] = [];
  let discoveries = 0;
  for (let pack = 0; pack < product.packs; pack++) {
    const id = product.packs === 1 ? tx : tx + "_" + pack;
    const newIds: string[] = [];
    const instances: string[] = [];
    for (let index = 0; index < product.slots.length; index++) {
      const slot = product.slots[index],
        pool = slotPool(slot, set),
        tiers = [...new Set(pool.map((c) => c.tier))];
      const tier = slot.weighted ? rollTier(tiers, rng) : pick(tiers, rng);
      const c = pick(
        pool.filter((c) => c.tier === tier),
        rng,
      );
      const finish: Finish =
        c.tier === 6
          ? "gold"
          : c.tier === 5
            ? "rainbow"
            : c.tier === 4
              ? "textured"
              : c.tier === 3
                ? "holo"
                : slot.reverse
                  ? "reverse"
                  : c.holo
                    ? "holo"
                    : "matte";
      const own: OwnedCard = {
        instanceId: id + "_" + index,
        cardId: c.id,
        setId: c.setId,
        finish,
        tier: c.tier,
        obtainedAt: now,
        openingId: id,
      };
      generated.push(own);
      instances.push(own.instanceId);
      if (!known.has(c.id)) {
        newIds.push(own.instanceId);
        known.add(c.id);
        discoveries++;
      }
    }
    openings.push({
      id,
      setId: set.id,
      productId: product.id,
      packOrdinal: pack + 1,
      packCount: product.packs,
      instances,
      newIds,
      cursor: 0,
      phase: "sealed",
      createdAt: now,
    });
  }
  credit(s, -cost, tx, product.name + " · " + set.name, now);
  s.owned.push(...generated);
  s.purchaseIds.push(tx);
  s.pending = openings[0];
  s.queued = openings.slice(1);
  if (product.id === "daily") s.lastFreePack = utcDay(now);
  s.stats.packs += product.packs;
  s.stats.newCards += discoveries;
  s.stats.bestTier = Math.max(
    s.stats.bestTier,
    ...generated.map((c) => c.tier),
  );
  s.daily.packs += product.packs;
  s.daily.newCards += discoveries;
  s.weekly.packs += product.packs;
  const before = level(s.xp);
  s.xp += 40 * product.packs + discoveries * 10;
  if (level(s.xp) > before)
    credit(
      s,
      500 * (level(s.xp) - before),
      tx + "_level",
      "Collector level reward",
      now,
    );
  return s;
}
export function startReveal(save: Save, id: string): Save {
  if (save.pending?.id !== id || save.pending.phase !== "sealed") return save;
  return { ...save, pending: { ...save.pending, phase: "reveal" } };
}
export function advanceOpening(
  save: Save,
  id: string,
  expectedCursor: number,
): Save {
  if (
    save.pending?.id !== id ||
    save.pending.cursor !== expectedCursor ||
    save.pending.phase !== "reveal"
  )
    return save;
  const cursor = Math.min(
    save.pending.instances.length,
    save.pending.cursor + 1,
  );
  return {
    ...save,
    pending: {
      ...save.pending,
      cursor,
      phase: cursor === save.pending.instances.length ? "summary" : "reveal",
    },
  };
}
export function summaryOpening(save: Save, id: string): Save {
  return save.pending?.id === id
    ? {
        ...save,
        pending: {
          ...save.pending,
          cursor: save.pending.instances.length,
          phase: "summary",
        },
      }
    : save;
}
export function finishOpening(save: Save, id: string): Save {
  return save.pending?.id === id && save.pending.phase === "summary"
    ? {
        ...save,
        pending: save.queued?.[0] ?? null,
        queued: (save.queued ?? []).slice(1),
      }
    : save;
}
export function claimDaily(save: Save, now = Date.now()): Save {
  const day = utcDay(now);
  if (save.lastClaim === day) throw Error("Already claimed today");
  const s = fresh(save, now);
  s.streak = save.lastClaim === utcDay(now - 86400000) ? save.streak + 1 : 1;
  s.lastClaim = day;
  credit(s, 1000, "daily_" + day, "Daily reward", now);
  return s;
}
export function missions(save: Save, now = Date.now()): MissionProgress[] {
  const s = fresh(save, now);
  const rows: [
    string,
    string,
    number,
    number,
    number,
    "daily" | "weekly" | "lifetime",
  ][] = [
    ["open1", "Crack the seal", 1, s.daily.packs, 30, "daily"],
    ["open3", "Just one more", 3, s.daily.packs, 75, "daily"],
    ["new5", "New discoveries", 5, s.daily.newCards, 100, "daily"],
    ["inspect", "A closer look", 1, s.daily.inspections, 20, "daily"],
    ["weekly10", "A week in foil", 10, s.weekly.packs, 250, "weekly"],
    [
      "unique25",
      "Curate a collection",
      25,
      new Set(s.owned.map((c) => c.cardId)).size,
      150,
      "lifetime",
    ],
  ];
  return rows.map(([id, label, target, value, reward, period]) => ({
    id,
    label,
    target,
    value,
    reward: reward * 10,
    period,
    claimed: s.claims.includes(missionKey(id, period, now)),
  }));
}
function missionKey(id: string, period: string, now: number) {
  return (
    id +
    "_" +
    (period === "daily"
      ? utcDay(now)
      : period === "weekly"
        ? utcWeek(now)
        : "ever")
  );
}
export function claimMission(save: Save, id: string, now = Date.now()): Save {
  const m = missions(save, now).find((m) => m.id === id);
  if (!m || m.value < m.target) throw Error("Mission is not ready");
  if (m.claimed) throw Error("Already claimed");
  const s = fresh(save, now);
  const key = missionKey(id, m.period, now);
  s.claims.push(key);
  credit(s, m.reward, key, m.label, now);
  return s;
}
export function inspect(save: Save, now = Date.now()): Save {
  const s = fresh(save, now);
  s.stats.inspections++;
  s.daily.inspections++;
  return s;
}
export function recycle(save: Save, ids: string[], now = Date.now()): Save {
  if (ids.some((id) => lockedTradeIds(save).has(id)))
    throw Error("This card is reserved for a live trade");
  if (!ids.length) throw Error("Choose a duplicate");
  if (new Set(ids).size !== ids.length) throw Error("Duplicate selection");
  const chosen = ids.map((id) => save.owned.find((c) => c.instanceId === id));
  if (chosen.some((c) => !c)) throw Error("Card no longer owned");
  if (ids.some((id) => save.favourites.includes(id)))
    throw Error("Keep your favourite cards");
  if (
    ids.some(
      (id) =>
        save.pending?.instances.includes(id) ||
        save.queued?.some((p) => p.instances.includes(id)),
    )
  )
    throw Error("Finish opening first");
  const remaining = save.owned.filter((c) => !ids.includes(c.instanceId));
  if (chosen.some((c) => !remaining.some((r) => cardKey(r) === cardKey(c!))))
    throw Error("Keep the last copy of each finish");
  const s = fresh(save, now);
  s.owned = remaining;
  s.showcase = s.showcase.filter((id) => !ids.includes(id));
  credit(
    s,
    chosen.reduce((n, c) => n + [2, 4, 8, 12, 20, 30, 40][c!.tier], 0),
    "recycle_" + now,
    "Duplicate recycling",
    now,
  );
  return s;
}
export function claimStudy(save: Save, now = Date.now()): Save {
  const s = fresh(save, now);
  if (s.study.day !== utcDay(now))
    s.study = { day: utcDay(now), count: 0, last: 0 };
  if (s.study.count >= 20) throw Error("Daily study limit reached");
  if (now - s.study.last < 30000)
    throw Error("Let your eyes rest for a moment");
  s.study.count++;
  s.study.last = now;
  s.stats.studyWins++;
  s.xp += 10;
  credit(s, 250, "study_" + now, "Collector’s eye", now);
  return s;
}
export function favourite(save: Save, id: string): Save {
  if (!save.owned.some((c) => c.instanceId === id)) return save;
  return {
    ...save,
    favourites: save.favourites.includes(id)
      ? save.favourites.filter((x) => x !== id)
      : [...save.favourites, id],
  };
}
export function showcase(save: Save, id: string): Save {
  if (!save.owned.some((c) => c.instanceId === id)) return save;
  return {
    ...save,
    showcase: save.showcase.includes(id)
      ? save.showcase.filter((x) => x !== id)
      : [...save.showcase.slice(-2), id],
  };
}

export function purchaseAgain(
  save: Save,
  set: SetDefinition,
  expectedId: string,
  tx: string,
  now = Date.now(),
  rng = Math.random,
): Save {
  if (save.purchaseIds.includes(tx)) return save;
  const opening = save.pending;
  if (
    !opening ||
    opening.id !== expectedId ||
    opening.setId !== set.id ||
    opening.phase !== "summary"
  )
    throw Error("Pack changed. Return to the current opening.");
  if (save.queued.length) return finishOpening(save, expectedId);
  const productId =
    opening.productId === "daily" ? "standard" : opening.productId;
  return purchase(
    finishOpening(save, expectedId),
    set,
    tx,
    now,
    rng,
    productId,
  );
}
