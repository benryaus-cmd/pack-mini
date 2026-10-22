import {
  prepareTrade,
  cancelPreparedTrade,
  completeTrade,
  tradeDigest,
  type TradeTerms,
  type TradeJournal,
} from "../game/trading.ts";
import type { Save } from "../game/types.ts";
import { generateId } from "../game/uuid.ts";
export type RelayTerms = TradeTerms & {
  protocol: 3;
  devices: Record<string, string>;
  expiresAt: number;
  offerId: string;
};
export type RelayDependencies = {
  player: () => string;
  device: () => string;
  save: () => Save;
  update: (fn: (save: Save) => Save) => Promise<Save>;
  now: () => number;
  online: () => boolean;
  peerOnline?: (player: string) => boolean;
  authorize: (terms: RelayTerms) => boolean;
  send: (packet: unknown) => boolean;
  show: (terms: RelayTerms | null, error?: string) => void;
};
type Message = {
  id: string;
  action: string;
  terms: RelayTerms;
  digest: string;
  device: string;
  target: string;
  targetDevice: string;
};
/** The accepting device is the durable coordinator. Its IndexedDB transaction
 * chooses commit OR abort once. No generic HTTP record route is required. */
export class RelayTradeExchange {
  private d: RelayDependencies;
  private busy = false;
  private foreground: RelayTerms | null = null;
  private visibleUntil = 0;
  private retryCursor = 0;
  private parts = new Map<
    string,
    { pieces: string[]; total: number; at: number }
  >();
  constructor(dependencies: RelayDependencies) {
    this.d = dependencies;
  }
  private valid(t: RelayTerms) {
    return (
      t?.protocol === 3 &&
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
          t.devices[p].length <= 64 &&
          Array.isArray(t.offers?.[p]) &&
          t.offers[p].length >= 1 &&
          t.offers[p].length <= 3,
      ) &&
      Number.isFinite(t.expiresAt) &&
      typeof t.offerId === "string"
    );
  }
  private journal(t: RelayTerms) {
    const j = this.d.save().trades?.find((j) => j.id === t.id);
    if (j && j.digest !== tradeDigest(t))
      throw Error("Trade terms changed. Your copies remain reserved.");
    return j;
  }
  private show(t: RelayTerms | null, error = "") {
    if (t && this.foreground && this.foreground.id !== t.id) return;
    this.foreground = t;
    this.visibleUntil = this.d.now() + 30000;
    this.d.show(t, error);
  }
  private packet(t: RelayTerms, action: string) {
    const target = t.parties.find((p) => p !== this.d.player())!;
    const value: Message = {
      id: t.id,
      action,
      terms: t,
      digest: tradeDigest(t),
      device: this.d.device(),
      target,
      targetDevice: t.devices[target],
    };
    const text = JSON.stringify(value);
    if (text.length > 12000)
      throw Error("This bundle is too large to exchange.");
    const message = generateId(),
      total = Math.ceil(text.length / 500);
    for (let index = 0; index < total; index++) {
      const accepted = this.d.send({
        wire: 3,
        message,
        index,
        total,
        text: text.slice(index * 500, (index + 1) * 500),
        target,
        targetDevice: t.devices[target],
        device: this.d.device(),
      });
      if (!accepted) return false;
    }
    return true;
  }
  private async decide(t: RelayTerms, wanted: "commit" | "abort") {
    const me = this.d.player();
    if (t.parties[0] !== me)
      throw Error("Only the accepting device decides this exchange.");
    const saved = await this.d.update((s) => {
      const j = s.trades?.find((j) => j.id === t.id);
      if (!j || j.digest !== tradeDigest(t))
        throw Error("Trade reservation is missing.");
      if (j.decision) return s;
      if (j.status !== "ready") throw Error("This trade has ended.");
      const decision =
        wanted === "commit" && this.d.now() < t.expiresAt ? "commit" : "abort";
      const next: Save = {
        ...s,
        trades: s.trades?.map((j) =>
          j.id === t.id
            ? { ...j, decision, commitAttempted: decision === "commit" }
            : j,
        ),
      };
      return decision === "abort" ? cancelPreparedTrade(next, t.id, t) : next;
    });
    return saved.trades!.find((j) => j.id === t.id)!.decision!;
  }
  private async mark(t: RelayTerms, acknowledged = true) {
    await this.d.update((s) => ({
      ...s,
      trades: s.trades?.map((j) =>
        j.id === t.id ? { ...j, acknowledged } : j,
      ),
    }));
  }
  expire() {
    if (
      this.foreground &&
      this.d.now() >= Math.min(this.foreground.expiresAt, this.visibleUntil)
    )
      this.show(
        null,
        "Trade closed after 30 seconds. Uncommitted swaps return their cards; committed swaps recover in the background.",
      );
  }
  async start(t: RelayTerms) {
    if (this.busy) throw Error("Checking the previous exchange.");
    if (
      !this.valid(t) ||
      t.parties[0] !== this.d.player() ||
      t.expiresAt <= this.d.now() ||
      t.expiresAt > this.d.now() + 30000
    )
      throw Error("Invalid or expired trade.");
    this.busy = true;
    try {
      await this.d.update((s) => prepareTrade(s, t, this.d.player()));
      this.show(t);
      this.packet(t, "prepare");
    } finally {
      this.busy = false;
    }
  }
  async receive(packet: any, fromPlayer: string) {
    if (
      !packet ||
      packet.wire !== 3 ||
      packet.target !== this.d.player() ||
      packet.targetDevice !== this.d.device() ||
      fromPlayer === this.d.player() ||
      typeof packet.device !== "string" ||
      packet.device.length > 64 ||
      typeof packet.message !== "string" ||
      packet.message.length > 64 ||
      !Number.isInteger(packet.index) ||
      !Number.isInteger(packet.total) ||
      packet.total < 1 ||
      packet.total > 24 ||
      packet.index < 0 ||
      packet.index >= packet.total ||
      typeof packet.text !== "string" ||
      packet.text.length > 500
    )
      return;
    for (const [key, p] of this.parts)
      if (this.d.now() - p.at > 20000) this.parts.delete(key);
    const key = fromPlayer + ":" + packet.device + ":" + packet.message;
    if (!this.parts.has(key)) {
      if (this.parts.size >= 32)
        this.parts.delete(this.parts.keys().next().value!);
      this.parts.set(key, {
        pieces: [],
        total: packet.total,
        at: this.d.now(),
      });
    }
    const parts = this.parts.get(key)!;
    if (parts.total !== packet.total) return;
    parts.pieces[packet.index] = packet.text;
    if (
      Array.from({ length: parts.total }, (_, i) => parts.pieces[i]).some(
        (p) => typeof p !== "string",
      )
    )
      return;
    this.parts.delete(key);
    let message: Message;
    try {
      message = JSON.parse(parts.pieces.join(""));
    } catch {
      return;
    }
    const t = message.terms;
    if (
      !this.valid(t) ||
      message.id !== t.id ||
      message.digest !== tradeDigest(t) ||
      message.device !== packet.device ||
      message.device !== t.devices[fromPlayer] ||
      !t.parties.includes(fromPlayer) ||
      message.target !== packet.target ||
      message.targetDevice !== packet.targetDevice
    )
      return;
    if (this.busy) return; // Persisted journals retry each phase after missed/busy delivery.
    this.busy = true;
    try {
      await this.handle(t, message.action, fromPlayer);
    } catch (e) {
      if (this.foreground?.id === t.id)
        this.d.show(this.foreground, (e as Error).message);
    } finally {
      this.busy = false;
    }
  }
  private async handle(t: RelayTerms, action: string, from: string) {
    const me = this.d.player(),
      owner = t.parties[0];
    let j = this.journal(t);
    if (action === "prepare" && from === owner) {
      if (j) {
        await this.resend(t, j);
        return;
      }
      if (this.d.now() >= t.expiresAt || !this.d.authorize(t)) return;
      await this.d.update((s) => prepareTrade(s, t, me));
      this.show(t);
      this.packet(t, "ready");
      return;
    }
    if (action === "abort" && from === owner) {
      if (j?.decision === "commit" || j?.status === "completed") {
        this.packet(t, "applied");
        return;
      }
      if (!j && !this.d.authorize(t)) {
        this.packet(t, "cancelled");
        return;
      }
      await this.d.update((s) => {
        const next = cancelPreparedTrade(s, t.id, t);
        return {
          ...next,
          trades: next.trades?.map((j) =>
            j.id === t.id ? { ...j, decision: "abort", acknowledged: true } : j,
          ),
        };
      });
      if (this.foreground?.id === t.id)
        this.show(null, "Trade cancelled. Your original cards were kept.");
      this.packet(t, "cancelled");
      return;
    }
    if (!j) return;
    if (action === "ready" && me === owner) {
      const decision = await this.decide(t, "commit");
      this.packet(t, decision);
      return;
    }
    if (action === "commit" && from === owner) {
      if (j.status === "cancelled") return;
      await this.d.update((s) => {
        const next = completeTrade(s, t, me);
        return {
          ...next,
          trades: next.trades?.map((j) =>
            j.id === t.id
              ? { ...j, decision: "commit", commitAttempted: true }
              : j,
          ),
        };
      });
      if (this.foreground?.id === t.id)
        this.show(null, "Trade complete — your new cards are in your binder.");
      this.packet(t, "applied");
      return;
    }
    if (action === "applied" && me === owner) {
      if (j.decision !== "commit") {
        if (j.decision === "abort") this.packet(t, "abort");
        return;
      }
      await this.d.update((s) => completeTrade(s, t, me));
      await this.mark(t);
      if (this.foreground?.id === t.id)
        this.show(null, "Trade complete — your new cards are in your binder.");
      this.packet(t, "finished");
      return;
    }
    if (action === "finished" && from === owner && j.status === "completed") {
      await this.mark(t);
      return;
    }
    if (action === "cancelled" && me === owner && j.decision === "abort") {
      await this.mark(t);
      return;
    }
    if (action === "cancel" && me === owner) {
      const decision = await this.decide(t, "abort");
      this.packet(t, decision);
      return;
    }
    if (action === "status") await this.resend(t, j);
  }
  private async resend(t: RelayTerms, j: TradeJournal) {
    if (t.parties[0] === this.d.player()) {
      if (j.status === "completed") {
        return this.packet(t, "finished");
      }
      if (j.decision) {
        return this.packet(t, j.decision);
      }
      if (this.d.now() >= t.expiresAt) {
        return this.packet(t, await this.decide(t, "abort"));
      }
      return this.packet(t, "prepare");
    } else if (j.status === "completed") return this.packet(t, "applied");
    else if (j.status === "cancelled") return this.packet(t, "cancelled");
    else return this.packet(t, "ready");
  }
  async cancel() {
    const t = this.foreground;
    if (!t || this.busy) return;
    this.busy = true;
    try {
      if (t.parties[0] === this.d.player())
        this.packet(t, await this.decide(t, "abort"));
      else this.packet(t, "cancel");
    } finally {
      this.busy = false;
      if (this.foreground?.id === t.id)
        this.show(
          null,
          "Trade closed. Pending receipts recover in the background.",
        );
    }
  }
  async tick() {
    this.expire();
    if (this.busy) return;
    this.busy = true;
    try {
      // Abort an undecided local proposal at its deadline even while its peer
      // or the socket is offline. A prior commit can never be changed here.
      for (const j of this.d.save().trades ?? [])
        if (
          j.protocol === 3 &&
          j.status === "ready" &&
          !j.decision &&
          j.parties[0] === this.d.player() &&
          this.valid(j as RelayTerms) &&
          this.d.now() >= j.expiresAt!
        )
          await this.decide(j as RelayTerms, "abort");
      if (!this.d.online()) return;
      const pending = (this.d.save().trades ?? []).filter(
        (j) =>
          j.protocol === 3 &&
          !j.acknowledged &&
          this.valid(j as RelayTerms) &&
          (!this.d.peerOnline ||
            this.d.peerOnline(j.parties.find((p) => p !== this.d.player())!)),
      );
      const foreground = pending.find((j) => j.id === this.foreground?.id);
      const rest = pending.filter((j) => j !== foreground);
      const candidates: TradeJournal[] = foreground ? [foreground] : [];
      if (rest.length) {
        const start = this.retryCursor % rest.length;
        for (let i = 0; i < Math.min(2 - candidates.length, rest.length); i++)
          candidates.push(rest[(start + i) % rest.length]);
        this.retryCursor = (start + 1) % rest.length;
      }
      for (const j of candidates)
        if (!(await this.resend(j as RelayTerms, j))) break;
    } finally {
      this.busy = false;
    }
  }
}
