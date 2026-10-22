import { TradeRecords, TradeRecordError } from "./tradeRecords";
import { generateId } from "../game/uuid";
import { useEffect, useSyncExternalStore } from "react";
import type { Game } from "./useGame";
import type { OwnedCard, Save } from "../game/types";
import { cardById } from "../game/catalogue";
import { multiplayer } from "./multiplayer";
import {
  prepareTrade,
  completeTrade,
  cancelPreparedTrade,
  tradeDigest,
  type TradeTerms,
  type TradeJournal,
} from "../game/trading";
export interface LiveTrade extends TradeTerms {
  versions: Record<string, number>;
  ready: string[];
  status: "draft" | "unsubmitted" | "settling" | "completed" | "cancelled";
}
interface TradeState {
  session: LiveTrade | null;
  error: string;
  busy: boolean;
}
class Trading {
  private state: TradeState = { session: null, error: "", busy: false };
  private listeners = new Set<() => void>();
  private game: Game | null = null;
  private recovering = false;
  private requested: string[] = [];
  private requestedFor = "";
  private prefilled = new Set<string>();
  private epoch = 0;
  private guard() {
    const epoch = this.epoch,
      player = this.game?.profile?.playerId;
    return () => {
      if (epoch !== this.epoch || player !== this.game?.profile?.playerId)
        throw Error("Collector changed; trade action stopped");
    };
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private patch(p: Partial<TradeState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }
  bind(game: Game) {
    if (this.game?.profile?.playerId !== game.profile?.playerId) this.epoch++;
    this.game = game;
  }
  private me() {
    if (!this.game?.profile) throw Error("Profile loading");
    return this.game.profile.playerId;
  }
  private packet(action: string) {
    const t = this.state.session;
    if (!t) return;
    const me = this.me();
    const sent = multiplayer.send("trade", {
      action,
      id: t.id,
      parties: t.parties,
      target: t.parties.find((p) => p !== me),
      ...(action === "offer"
        ? { offer: t.offers[me], version: t.versions[me] ?? 0 }
        : {}),
      digest: tradeDigest(t),
      ...(action === "offer" &&
      this.requestedFor === t.id &&
      this.requested.length
        ? { requested: this.requested }
        : {}),
    });
    if (!sent && multiplayer.snapshot().status === "online")
      this.patch({ error: "Trade update queued for recovery. Please wait." });
  }
  invite(player: string, ownIds?: string[], remoteIds?: string[]) {
    this.requested = (remoteIds ?? []).slice(0, 3);
    if (multiplayer.snapshot().status !== "online")
      throw Error("Waiting for a connection");
    if (
      this.state.session &&
      !["completed", "cancelled"].includes(this.state.session.status)
    )
      throw Error("Finish the current trade first");
    const me = this.me();
    if (player === me) throw Error("Choose another collector");
    const id = generateId().slice(0, 20);
    this.requestedFor = id;
    this.patch({
      session: {
        id,
        parties: [me, player],
        offers: { [me]: [], [player]: [] },
        versions: { [me]: 0, [player]: 0 },
        ready: [],
        status: "draft",
      },
      error: "",
    });
    this.packet("offer");
    if (ownIds?.length) this.offer(ownIds);
    if (!ownIds && !remoteIds)
      void multiplayer
        .chat(
          `🎴 Trade offer from ${this.game!.profile!.nickName} · open Trades to respond.`,
        )
        .catch(() => {});
  }
  offer(ids: string[]) {
    const t = this.state.session;
    if (!t || t.status !== "draft") return;
    if (t.ready.length)
      throw Error("This offer is locked while confirmation is pending");
    const me = this.me();
    const save = this.game!.save!;
    const cards = ids
      .map((id) => save.owned.find((c) => c.instanceId === id))
      .filter((c): c is OwnedCard => !!c);
    if (cards.length > 3) throw Error("Choose up to three cards");
    this.patch({
      session: {
        ...t,
        offers: { ...t.offers, [me]: cards },
        versions: { ...t.versions, [me]: (t.versions[me] ?? 0) + 1 },
        ready: [],
      },
      error: "",
    });
    this.packet("offer");
  }
  async accept(event: string, data: unknown, from: string) {
    const check = this.guard();
    if (event !== "trade" || !this.game?.profile) return;
    const d = data as any,
      me = this.me(),
      peer = multiplayer.snapshot().peers[from];
    if (
      !peer ||
      !d ||
      d.target !== me ||
      !/^[a-z0-9]{20}$/.test(d.id) ||
      !Array.isArray(d.parties) ||
      d.parties.length !== 2 ||
      new Set(d.parties).size !== 2 ||
      !d.parties.includes(me) ||
      !d.parties.includes(peer.profile.playerId)
    )
      return;
    const other = peer.profile.playerId;
    if (
      this.game.save?.trades?.some((j) => j.id === d.id && j.status !== "ready")
    )
      return;
    let t = this.state.session;
    if (!t || ["completed", "cancelled"].includes(t.status)) {
      if (d.action !== "offer" && d.action !== "ready") return;
      if (d.action === "ready") {
        let terms: any;
        try {
          const record = await this.records().read(d.id, other);
          terms = record?.data;
        } catch {
          return;
        }
        check();
        if (
          terms?.id !== d.id ||
          !Array.isArray(terms.parties) ||
          terms.parties.length !== 2 ||
          !terms.parties.includes(me) ||
          !terms.parties.includes(other) ||
          terms.digest !== d.digest ||
          tradeDigest(terms) !== d.digest ||
          !["ready", "completed"].includes(terms.status)
        )
          return;
        if (
          !terms.offers ||
          !terms.parties.every(
            (p: string) =>
              Array.isArray(terms.offers[p]) &&
              terms.offers[p].length >= 1 &&
              terms.offers[p].length <= 3 &&
              terms.offers[p].every(
                (c: any) =>
                  c &&
                  cardById.has(c.cardId) &&
                  typeof c.instanceId === "string",
              ),
          )
        )
          return;
        t = {
          id: terms.id,
          parties: terms.parties,
          offers: terms.offers,
          versions: { [me]: 0, [other]: 0 },
          ready: [other],
          status: "draft",
        };
        this.patch({ session: t });
      } else if (d.action === "offer")
        t = {
          id: d.id,
          parties: d.parties,
          offers: { [me]: [], [other]: [] },
          versions: { [me]: 0, [other]: -1 },
          ready: [],
          status: "draft",
        };
      else return;
    }
    if (!t || t.id !== d.id) return;
    if (d.action === "offer") {
      if (
        t.ready.length ||
        t.status !== "draft" ||
        !Number.isSafeInteger(d.version) ||
        d.version <= (t.versions[other] ?? -1) ||
        !Array.isArray(d.offer) ||
        d.offer.length > 3
      )
        return;
      const valid = d.offer.every(
        (c: any) =>
          c &&
          typeof c.instanceId === "string" &&
          c.instanceId.length <= 64 &&
          cardById.has(c.cardId) &&
          cardById.get(c.cardId)?.setId === c.setId &&
          Number.isInteger(c.tier) &&
          c.tier >= 0 &&
          c.tier <= 6 &&
          [
            "matte",
            "gloss",
            "reverse",
            "holo",
            "textured",
            "rainbow",
            "gold",
          ].includes(c.finish),
      );
      if (
        !valid ||
        new Set(d.offer.map((c: any) => c.instanceId)).size !== d.offer.length
      )
        return;
      this.patch({
        session: {
          ...t,
          offers: { ...t.offers, [other]: d.offer },
          versions: { ...t.versions, [other]: d.version },
        },
        error: "",
      });
      if ((t.versions[other] ?? -1) === -1) this.packet("offer");
      if (
        !this.prefilled.has(t.id) &&
        Array.isArray(d.requested) &&
        d.requested.length <= 3
      ) {
        this.prefilled.add(t.id);
        const ids = d.requested.filter(
          (id: unknown) =>
            typeof id === "string" &&
            this.game?.save?.owned.some((c) => c.instanceId === id),
        );
        if (
          ids.length === d.requested.length &&
          !this.state.session?.ready.length
        )
          this.offer(ids);
      }
    } else if (d.action === "ready" && d.digest !== tradeDigest(t)) {
      {
        await this.store(t, "cancelled");
        check();
        const s: Save = await this.game.update((s) =>
          cancelPreparedTrade(s, t!.id, t!),
        );
        check();
        this.game = { ...this.game, save: s };
        this.patch({
          session: { ...t, status: "cancelled" },
          error: "Offers crossed in transit. Start a fresh trade.",
        });
        this.packet("cancel");
      }
    } else if (d.action === "ready" && d.digest === tradeDigest(t)) {
      this.patch({
        session: { ...t, ready: [...new Set([...t.ready, other])] },
      });
      await this.recover();
      check();
    } else if (d.action === "cancel") {
      await this.recover();
      check();
      if (!this.game.save?.trades?.some((j) => j.id === t!.id)) {
        const saved: Save = await this.game.update((s) => ({
          ...s,
          trades: [
            ...(s.trades ?? []).slice(-49),
            {
              ...t!,
              digest: tradeDigest(t!),
              status: "cancelled",
              at: Date.now(),
            },
          ],
        }));
        check();
        this.game = { ...this.game, save: saved };
      }
      if (
        !this.game.save?.trades?.some(
          (j) => j.id === t!.id && j.status === "ready",
        )
      )
        this.patch({ session: { ...t, status: "cancelled" } });
    } else if (d.action === "receipt") await this.recover();
    check();
  }
  private records() {
    const check = this.guard();
    return new TradeRecords((path, options) => {
      check();
      return multiplayer.request(path, options);
    });
  }
  private async store(terms: TradeTerms, status: TradeJournal["status"]) {
    const check = this.guard();
    const record = await this.records().write(terms, this.me(), status);
    check();
    return record;
  }
  async confirm() {
    const check = this.guard(),
      epoch = this.epoch;
    const t = this.state.session;
    if (
      !t ||
      this.state.busy ||
      this.recovering ||
      !["draft", "unsubmitted"].includes(t.status)
    )
      return;
    const preparedNew = !this.game!.save!.trades?.some((j) => j.id === t.id);
    let published = false;
    this.patch({ busy: true, error: "" });
    try {
      const me = this.me();
      const saved = await this.game!.update((s) => prepareTrade(s, t, me));
      check();
      this.game = { ...this.game!, save: saved };
      this.patch({
        session: {
          ...t,
          ready: t.ready.filter((p) => p !== me),
          status: "settling",
        },
      });
      await this.store(t, "ready");
      check();
      published = true;
      this.patch({
        session: {
          ...this.state.session!,
          ready: [...new Set([...this.state.session!.ready, me])],
          status: "settling",
        },
      });
      this.packet("ready");
    } catch (e) {
      if (epoch !== this.epoch) return;
      if (
        !published &&
        preparedNew &&
        e instanceof TradeRecordError &&
        e.definitive
      ) {
        const saved = await this.game!.update((s) =>
          cancelPreparedTrade(s, t.id),
        );
        check();
        this.game = { ...this.game!, save: saved };
        this.patch({
          session: { ...t, ready: [], status: "cancelled" },
          error: e.message,
        });
        this.packet("cancel");
      } else
        this.patch({
          session: {
            ...this.state.session!,
            status: published ? "settling" : "unsubmitted",
          },
          error: (e as Error).message,
        });
    } finally {
      if (epoch === this.epoch) this.patch({ busy: false });
    }
    if (published && epoch === this.epoch) await this.recover();
  }
  private async cancelUnsubmitted(t: LiveTrade) {
    const check = this.guard(),
      epoch = this.epoch;
    if (this.recovering)
      throw Error("Checking this trade. Try cancel again in a moment.");
    this.patch({ busy: true, error: "" });
    try {
      const records = this.records();
      const own = await records.read(t.id, this.me());
      check();
      if (own && own.data.status !== "cancelled")
        throw Error(
          "Confirmation is already on the server. Retry recovery to finish safely.",
        );
      const other = await records.read(
        t.id,
        t.parties.find((p) => p !== this.me())!,
      );
      check();
      if (other?.data.status === "completed")
        throw Error(
          "The other collector has completed this trade. Retry recovery to finish safely.",
        );
      await this.store(t, "cancelled");
      check();
      const saved = await this.game!.update((s) =>
        cancelPreparedTrade(s, t.id, t),
      );
      check();
      this.game = { ...this.game!, save: saved };
      this.patch({
        session: { ...t, ready: [], status: "cancelled" },
        error: "",
      });
      this.packet("cancel");
    } catch (e) {
      if (epoch === this.epoch) this.patch({ error: (e as Error).message });
    } finally {
      if (epoch === this.epoch) this.patch({ busy: false });
    }
  }
  async decline() {
    const check = this.guard(),
      epoch = this.epoch;
    const t = this.state.session;
    if (!t || this.state.busy) return;
    if (
      this.game?.save?.trades?.some(
        (j) => j.id === t.id && j.status === "ready",
      )
    )
      return this.cancelUnsubmitted(t);
    this.patch({ busy: true });
    try {
      await this.store(t, "cancelled");
      check();
      const saved = await this.game!.update((s) => ({
        ...s,
        trades: [
          ...(s.trades ?? []).filter((j) => j.id !== t.id).slice(-49),
          { ...t, digest: tradeDigest(t), status: "cancelled", at: Date.now() },
        ],
      }));
      check();
      this.game = { ...this.game!, save: saved };
      this.packet("cancel");
      this.patch({ session: { ...t, status: "cancelled" }, error: "" });
    } catch (e) {
      if (epoch !== this.epoch) return;
      this.patch({ error: (e as Error).message });
    } finally {
      if (epoch === this.epoch) this.patch({ busy: false });
    }
  }
  async recover() {
    if (
      this.recovering ||
      this.state.busy ||
      !this.game?.profile ||
      !this.game.save ||
      multiplayer.snapshot().status !== "online"
    )
      return;
    this.recovering = true;
    const check = this.guard(),
      epoch = this.epoch;
    try {
      const me = this.me();
      for (const j of (this.game.save.trades ?? []).filter(
        (j) => j.status === "ready",
      )) {
        const records = this.records();
        const own = await records.read(j.id, me);
        check();
        const other = await records.read(
          j.id,
          j.parties.find((p) => p !== me)!,
        );
        check();
        const current =
          this.state.session?.id === j.id ? this.state.session : null;
        const base = {
          ...j,
          versions: current?.versions ?? {},
          ready: current?.ready ?? [],
        };
        if (own && own.data.digest !== j.digest) {
          this.patch({
            session: { ...base, status: "unsubmitted" },
            error:
              "The server confirmation differs from this saved trade. Your cards remain reserved.",
          });
          continue;
        }
        if (
          own?.data.status === "cancelled" ||
          other?.data.status === "cancelled"
        ) {
          const saved: Save = await this.game.update((s) =>
            cancelPreparedTrade(s, j.id, j),
          );
          check();
          this.game = { ...this.game, save: saved };
          this.patch({
            session: { ...base, ready: [], status: "cancelled" },
            error: "",
          });
          continue;
        }
        if (other && other.data.digest !== j.digest) {
          this.patch({
            session: { ...base, status: "unsubmitted" },
            error:
              "The saved offers differ. Review this trade before retrying.",
          });
          continue;
        }
        if (!own && other?.data.status !== "completed") {
          this.patch({
            session: {
              ...base,
              ready: base.ready.filter((p) => p !== me),
              status: "unsubmitted",
            },
            error:
              "This trade was saved on this device but its confirmation was not delivered. Retry or cancel this unsent trade.",
          });
          continue;
        }
        this.patch({
          session: {
            ...base,
            ready: [...new Set([...base.ready, me])],
            status: "settling",
          },
          error: "",
        });
        this.packet("ready");
        if (
          other &&
          ["ready", "completed"].includes(other.data.status) &&
          other.data.digest === j.digest &&
          tradeDigest(other.data) === j.digest
        ) {
          const saved: Save = await this.game.update((s) =>
            completeTrade(s, j, me),
          );
          check();
          this.game = { ...this.game, save: saved };
          this.patch({
            session: { ...base, status: "completed", ready: j.parties },
            error: "",
          });
          await this.store(j, "completed");
          check();
          this.packet("receipt");
        }
      }
    } catch (e) {
      if (epoch === this.epoch)
        this.patch({
          error:
            "Your cards remain reserved. Recovery could not verify this trade. " +
            (e as Error).message,
        });
    } finally {
      if (epoch === this.epoch) this.recovering = false;
    }
  }
  reset() {
    this.requested = [];
    this.requestedFor = "";
    this.prefilled.clear();
    this.epoch++;
    this.recovering = false;
    this.game = null;
    this.patch({ session: null, error: "", busy: false });
  }
}
export const trading = new Trading();
export function useTrading(game: Game) {
  trading.bind(game);
  useEffect(() => {
    if (!game.profile || !game.save) return;
    trading.bind(game);
    const stop = multiplayer.onEvent((e, d, f) => {
      void trading.accept(e, d, f).catch(() => {});
    });
    const timer = setInterval(() => {
      void trading.recover();
    }, 5000);
    void trading.recover();
    return () => {
      stop();
      clearInterval(timer);
      trading.reset();
    };
  }, [game.profile?.playerId, !!game.save]);
  return useSyncExternalStore(trading.subscribe, trading.snapshot);
}
