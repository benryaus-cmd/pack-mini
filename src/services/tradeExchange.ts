import {
  prepareTrade,
  cancelPreparedTrade,
  completeTrade,
  tradeDigest,
  type TradeTerms,
} from "../game/trading.ts";
import type { Save } from "../game/types.ts";
export type ExchangeTerms = TradeTerms & {
  protocol: 2;
  devices: Record<string, string>;
  expiresAt: number;
  offerId: string;
};
type Coordinator = {
  kind: "mini-exchange";
  terms: ExchangeTerms;
  digest: string;
  phase: "prepare" | "commit" | "abort";
};
type Receipt = {
  kind: "mini-exchange-receipt";
  id: string;
  digest: string;
  device: string;
  phase: "prepared" | "applied";
};
type RecordValue<T> = { owner: string; revision: number; data: T };
export type ExchangeDependencies = {
  player: () => string;
  device: () => string;
  save: () => Save;
  update: (fn: (s: Save) => Save) => Promise<Save>;
  now: () => number;
  online: () => boolean;
  authorize: (
    terms: Omit<ExchangeTerms, "protocol"> & { protocol: 2 | 3 },
  ) => boolean;
  send: (packet: any) => boolean;
  request: (path: string, options?: RequestInit) => Promise<any>;
  show: (
    terms: (Omit<ExchangeTerms, "protocol"> & { protocol: 2 | 3 }) | null,
    error?: string,
  ) => void;
};
const status = (e: unknown) => (e as { status?: number })?.status;
export function collectionDevice() {
  const key = "packmini-trade-device";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID().replaceAll("-", "");
    localStorage.setItem(key, id);
  }
  return id;
}
export class TradeExchange {
  private d: ExchangeDependencies;
  private busy = false;
  private foreground: ExchangeTerms | null = null;
  constructor(dependencies: ExchangeDependencies) {
    this.d = dependencies;
  }
  private path(t: ExchangeTerms) {
    return "/data/social/mx_" + t.id;
  }
  private receiptPath(t: ExchangeTerms, player: string) {
    return "/data/social/mr_" + t.id + "_" + t.devices[player].slice(0, 8);
  }
  private async get<T>(path: string): Promise<RecordValue<T> | null> {
    try {
      return (await this.d.request(path)).record ?? null;
    } catch (e) {
      if (status(e) === 404) return null;
      throw e;
    }
  }
  private valid(t: ExchangeTerms) {
    return (
      t?.protocol === 2 &&
      /^[a-z0-9]{20}$/.test(t.id) &&
      Array.isArray(t.parties) &&
      t.parties.length === 2 &&
      new Set(t.parties).size === 2 &&
      t.parties.includes(this.d.player()) &&
      t.devices?.[this.d.player()] === this.d.device() &&
      t.parties.every(
        (p) =>
          typeof t.devices[p] === "string" &&
          t.devices[p].length >= 8 &&
          Array.isArray(t.offers[p]) &&
          t.offers[p].length >= 1 &&
          t.offers[p].length <= 3,
      ) &&
      Number.isFinite(t.expiresAt) &&
      typeof t.offerId === "string"
    );
  }
  private async coordinator(t: ExchangeTerms) {
    const r = await this.get<Coordinator>(this.path(t));
    if (
      r &&
      (r.owner !== t.parties[0] ||
        r.data.kind !== "mini-exchange" ||
        r.data.digest !== tradeDigest(t) ||
        tradeDigest(r.data.terms) !== tradeDigest(t) ||
        !["prepare", "commit", "abort"].includes(r.data.phase))
    )
      throw Error("Trade receipt does not match this device and these cards.");
    return r;
  }
  private async put<T>(path: string, data: T, revision: number) {
    return (
      await this.d.request(path, {
        method: "PUT",
        body: JSON.stringify({ data, expectedRevision: revision }),
      })
    ).record as RecordValue<T>;
  }
  private async decision(t: ExchangeTerms, phase: Coordinator["phase"]) {
    if (t.parties[0] !== this.d.player())
      throw Error("Only the accepting collector may decide this trade.");
    for (let attempt = 0; attempt < 3; attempt++) {
      const old = await this.coordinator(t);
      if (
        !old &&
        this.d.save().trades?.find((j) => j.id === t.id)?.commitAttempted
      )
        throw Error(
          "The committed trade receipt is temporarily unavailable. These exact cards remain reserved while recovery continues.",
        );
      if (old?.data.phase === "commit" || old?.data.phase === "abort")
        return old.data.phase;
      if (phase === "commit" && this.d.now() >= t.expiresAt) phase = "abort";
      if (phase === "commit")
        await this.d.update((s) => ({
          ...s,
          trades: s.trades?.map((j) =>
            j.id === t.id ? { ...j, commitAttempted: true } : j,
          ),
        }));
      const data: Coordinator = {
        kind: "mini-exchange",
        terms: t,
        digest: tradeDigest(t),
        phase,
      };
      try {
        await this.put(this.path(t), data, old?.revision ?? 0);
        return phase;
      } catch (e) {
        if (status(e) !== 409) throw e;
      }
    }
    throw Error("Trade changed while saving; retrying safely.");
  }
  private packet(t: ExchangeTerms, action: string) {
    const other = t.parties.find((p) => p !== this.d.player())!;
    this.d.send({
      id: t.id,
      action,
      target: other,
      targetDevice: t.devices[other],
      device: this.d.device(),
    });
  }
  private async receipt(t: ExchangeTerms, player: string) {
    const r = await this.get<Receipt>(this.receiptPath(t, player));
    if (
      r &&
      (r.owner !== player ||
        r.data.kind !== "mini-exchange-receipt" ||
        r.data.id !== t.id ||
        r.data.device !== t.devices[player] ||
        r.data.digest !== tradeDigest(t) ||
        !["prepared", "applied"].includes(r.data.phase))
    )
      throw Error("The other device receipt does not match.");
    return r;
  }
  private async publish(t: ExchangeTerms, phase: Receipt["phase"]) {
    const me = this.d.player();
    for (let i = 0; i < 3; i++) {
      const old = await this.receipt(t, me);
      if (old?.data.phase === "applied" || old?.data.phase === phase) return;
      try {
        await this.put(
          this.receiptPath(t, me),
          {
            kind: "mini-exchange-receipt",
            id: t.id,
            device: this.d.device(),
            digest: tradeDigest(t),
            phase,
          },
          old?.revision ?? 0,
        );
        return;
      } catch (e) {
        if (status(e) !== 409) throw e;
      }
    }
    throw Error("Receipt changed; retrying.");
  }
  private show(t: ExchangeTerms | null, error = "") {
    if (t && this.foreground && this.foreground.id !== t.id) return;
    this.foreground = t;
    this.d.show(t, error);
  }
  expire() {
    if (this.foreground && this.d.now() >= this.foreground.expiresAt)
      this.show(
        null,
        "Trade timed out. You can trade again; any committed swap continues recovering its exact cards.",
      );
  }
  async start(t: ExchangeTerms) {
    if (this.busy) throw Error("Checking the previous trade.");
    if (
      !this.valid(t) ||
      t.parties[0] !== this.d.player() ||
      t.expiresAt <= this.d.now() ||
      t.expiresAt > this.d.now() + 30000
    )
      throw Error("Invalid or expired trade.");
    this.busy = true;
    this.show(t);
    try {
      await this.d.update((s) => prepareTrade(s, t, this.d.player()));
      await this.decision(t, "prepare");
      this.packet(t, "request");
    } catch (e) {
      if (status(e) === 404 || status(e) === 405) {
        await this.d.update((s) => cancelPreparedTrade(s, t.id, t));
        this.show(null, "Trade storage is unavailable. Your cards were kept.");
      }
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async receive(data: any, fromPlayer: string) {
    if (
      this.busy ||
      !data ||
      !/^[a-z0-9]{20}$/.test(data.id) ||
      data.target !== this.d.player() ||
      data.targetDevice !== this.d.device() ||
      fromPlayer === this.d.player()
    )
      return;
    this.busy = true;
    try {
      // Relay carries only routing; complete bundle terms come from the verified record.
      const t = (await this.get<Coordinator>("/data/social/mx_" + data.id))
        ?.data?.terms;
      if (
        !t ||
        !this.valid(t) ||
        t.id !== data.id ||
        !t.parties.includes(fromPlayer) ||
        data.device !== t.devices[fromPlayer]
      )
        return;
      const r = await this.coordinator(t);
      if (!r) return;
      if (
        data.action === "request" &&
        r.data.phase === "prepare" &&
        t.parties[0] === fromPlayer &&
        this.d.now() < t.expiresAt &&
        this.d.authorize(t)
      ) {
        await this.d.update((s) => prepareTrade(s, t, this.d.player()));
        await this.publish(t, "prepared");
        this.show(t);
        this.packet(t, "prepared");
      } else if (
        data.action === "prepared" &&
        t.parties[0] === this.d.player() &&
        r.data.phase === "prepare"
      ) {
        const j = this.d.save().trades?.find((j) => j.id === t.id);
        const peer = await this.receipt(t, fromPlayer);
        if (j?.status === "ready" && peer?.data.phase === "prepared") {
          await this.decision(t, "commit");
          this.packet(t, "commit");
        }
      } else if (
        data.action === "abort" &&
        t.parties[0] === this.d.player() &&
        r.data.phase === "prepare"
      )
        await this.decision(t, "abort");
      await this.settle(t);
    } catch (e) {
      if (this.foreground?.id === data.id)
        this.d.show(this.foreground, (e as Error).message);
    } finally {
      this.busy = false;
    }
  }
  private async settle(t: ExchangeTerms) {
    const me = this.d.player(),
      other = t.parties.find((p) => p !== me)!;
    let r = await this.coordinator(t);
    const j = this.d.save().trades?.find((j) => j.id === t.id);
    if (!j || j.status === "cancelled" || j.acknowledged) return;
    if (!r) {
      if (
        me === t.parties[0] &&
        this.d.now() >= t.expiresAt &&
        !j.commitAttempted
      ) {
        await this.d.update((s) => cancelPreparedTrade(s, t.id, t));
        if (this.foreground?.id === t.id)
          this.show(null, "Trade expired. Your original cards were kept.");
      }
      return;
    }
    if (r.data.phase === "prepare" && this.d.now() >= t.expiresAt) {
      if (me === t.parties[0]) {
        await this.decision(t, "abort");
        r = await this.coordinator(t);
      } else this.packet(t, "abort");
    }
    if (r?.data.phase === "abort") {
      await this.d.update((s) => cancelPreparedTrade(s, t.id, t));
      if (this.foreground?.id === t.id)
        this.show(null, "Trade cancelled. Your original cards were kept.");
      this.packet(t, "cancelled");
      return;
    }
    if (r?.data.phase === "prepare") {
      if (me === t.parties[0]) {
        const peer = await this.receipt(t, other);
        if (peer?.data.phase === "prepared" && this.d.now() < t.expiresAt) {
          await this.decision(t, "commit");
          this.packet(t, "commit");
        } else this.packet(t, "request");
      } else {
        await this.publish(t, "prepared");
        this.packet(t, "prepared");
      }
      return;
    }
    if (r?.data.phase === "commit") {
      // Responder applies first. Accepter finishes only after reading its durable receipt.
      if (me === t.parties[0]) {
        const peer = await this.receipt(t, other);
        if (peer?.data.phase !== "applied") {
          this.packet(t, "commit");
          return;
        }
      }
      await this.d.update((s) => completeTrade(s, t, me));
      await this.publish(t, "applied");
      await this.d.update((s) => ({
        ...s,
        trades: s.trades?.map((j) =>
          j.id === t.id ? { ...j, acknowledged: true } : j,
        ),
      }));
      if (this.foreground?.id === t.id)
        this.show(null, "Trade complete — your new cards are in your binder.");
      this.packet(t, "applied");
    }
  }
  async cancel() {
    const t = this.foreground;
    if (!t || this.busy) return;
    this.busy = true;
    try {
      const r = await this.coordinator(t);
      if (r?.data.phase === "commit") {
        this.show(null, "Committed trade is finishing in the background.");
        return;
      }
      if (t.parties[0] === this.d.player()) {
        await this.decision(t, "abort");
        await this.settle(t);
      } else {
        this.packet(t, "abort");
        this.show(
          null,
          "Cancellation requested. You can trade with other cards now.",
        );
      }
    } finally {
      this.busy = false;
      if (this.foreground?.id === t.id)
        this.show(
          null,
          "Trade closed. Any pending receipt continues recovering in the background.",
        );
    }
  }
  async tick() {
    this.expire();
    if (this.busy || !this.d.online()) return;
    this.busy = true;
    try {
      for (const j of this.d.save().trades ?? []) {
        if (
          j.protocol !== 2 ||
          !this.valid(j as ExchangeTerms) ||
          j.status === "cancelled" ||
          j.acknowledged
        )
          continue;
        try {
          await this.settle(j as ExchangeTerms);
        } catch (e) {
          if (this.foreground?.id === j.id)
            this.d.show(this.foreground, (e as Error).message);
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
