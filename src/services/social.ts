import { useEffect, useSyncExternalStore } from "react";
import type { Game } from "./useGame";
import { multiplayer, ApiError } from "./multiplayer";
import { recordLimit } from "./protocol";
import type { OwnedCard, Profile } from "../game/types";
import { cardById } from "../game/catalogue";
export type SocialCard = Pick<
  OwnedCard,
  "instanceId" | "cardId" | "finish" | "ham"
>;
export type SocialEntry = {
  id: string;
  player: string;
  at: number;
  room: string;
  kind: "vote" | "post" | "offer";
  message?: string;
  vote?: 1 | -1 | 0;
  parent?: string;
  target?: string;
  cards?: SocialCard[];
};
type State = { entries: SocialEntry[] };
const MAX = 24;
export function mergeSocial(a: SocialEntry[], b: SocialEntry[]) {
  const by = new Map<string, SocialEntry>();
  for (const e of [...a, ...b]) {
    const key = e.kind === "vote" ? `v:${e.player}:${e.message}` : e.id;
    const old = by.get(key);
    if (!old || old.at <= e.at) by.set(key, e);
  }
  return [...by.values()].sort((a, b) => a.at - b.at).slice(-400);
}
function valid(e: any, player: string, room: string): e is SocialEntry {
  return (
    !!e &&
    e.player === player &&
    e.room === room &&
    typeof e.id === "string" &&
    e.id.length <= 80 &&
    Number.isFinite(e.at) &&
    ["vote", "post", "offer"].includes(e.kind) &&
    (e.kind === "vote"
      ? typeof e.message === "string" &&
        e.message.length <= 80 &&
        [-1, 0, 1].includes(e.vote)
      : Array.isArray(e.cards) &&
        e.cards.length > 0 &&
        e.cards.length <= 3 &&
        e.cards.every(
          (c: any) =>
            c &&
            typeof c.instanceId === "string" &&
            c.instanceId.length <= 64 &&
            cardById.has(c.cardId) &&
            (c.ham === undefined || [7, 8, 9, 10].includes(c.ham)) &&
            [
              "matte",
              "gloss",
              "reverse",
              "holo",
              "textured",
              "rainbow",
              "gold",
            ].includes(c.finish),
        ) &&
        (e.kind !== "offer" ||
          (typeof e.parent === "string" && typeof e.target === "string")))
  );
}
class SocialService {
  private state: State = { entries: [] };
  private listeners = new Set<() => void>();
  private profile: Profile | null = null;
  private mine: SocialEntry[] = [];
  private room = "";
  private revision = 0;
  private writes = Promise.resolve();
  private stopped: (() => void)[] = [];
  private scope = 0;
  private connection = "";
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private merge(entries: SocialEntry[]) {
    this.state = { entries: mergeSocial(this.state.entries, entries) };
    this.listeners.forEach((fn) => fn());
  }
  bind(profile: Profile) {
    if (
      this.profile?.playerId === profile.playerId &&
      this.room === multiplayer.snapshot().room
    )
      return;
    this.stop();
    this.profile = profile;
    this.room = multiplayer.snapshot().room;
    this.mine = [];
    this.revision = 0;
    this.state = { entries: [] };
    this.listeners.forEach((fn) => fn());
    this.connection = "";
    const epoch = ++this.scope;
    this.stopped.push(
      multiplayer.onEvent((event, data, from) => {
        const peer = multiplayer.snapshot().peers[from];
        if (
          event === "mini-social" &&
          peer &&
          valid(data, peer.profile.playerId, this.room)
        )
          this.merge([data]);
      }),
    );
    this.stopped.push(
      multiplayer.subscribe(() => {
        const n = multiplayer.snapshot();
        if (n.status === "online" && n.connectionId !== this.connection) {
          this.connection = n.connectionId;
          void this.load(epoch);
        }
      }),
    );
    if (multiplayer.snapshot().status === "online") {
      this.connection = multiplayer.snapshot().connectionId;
      void this.load(epoch);
    }
  }
  stop() {
    this.stopped.forEach((fn) => fn());
    this.stopped = [];
    this.profile = null;
    this.scope++;
  }
  private async load(epoch: number) {
    try {
      await multiplayer.discover();
      const r = await multiplayer.request("/data/social");
      if (epoch !== this.scope) return;
      const direct = await Promise.all(
        [
          this.profile?.playerId,
          ...Object.values(multiplayer.snapshot().peers).map(
            (p) => p.profile.playerId,
          ),
        ]
          .filter((p): p is string => !!p)
          .map(async (player) => {
            try {
              return (
                await multiplayer.request(
                  "/data/social/" + ("ms_" + player).slice(0, 40),
                )
              ).record;
            } catch {
              return null;
            }
          }),
      );
      if (epoch !== this.scope) return;
      for (const record of [...(r.records ?? []), ...direct.filter(Boolean)]) {
        const d = record.data;
        if (
          d?.kind !== "mini-social" ||
          d.room !== this.room ||
          typeof d.player !== "string" ||
          (record.owner && record.owner !== d.player)
        )
          continue;
        const entries = (Array.isArray(d.entries) ? d.entries : []).filter(
          (e: any) => valid(e, d.player, this.room),
        );
        this.merge(entries);
        if (d.player === this.profile?.playerId) {
          this.mine = mergeSocial(this.mine, entries).slice(-MAX);
          this.revision = record.revision ?? 0;
        }
      }
    } catch {
      /* Best-effort history; live relay continues. */
    }
  }
  private emit(entry: Omit<SocialEntry, "player" | "room" | "id" | "at">) {
    if (!this.profile || multiplayer.snapshot().status !== "online")
      throw Error("Connect to the room first.");
    const e: SocialEntry = {
      ...entry,
      id: crypto.randomUUID().replaceAll("-", "").slice(0, 20),
      player: this.profile.playerId,
      room: this.room,
      at: Math.max(Date.now(), ...this.mine.map((x) => x.at + 1)),
    };
    if (!multiplayer.send("mini-social", e))
      throw Error("Connection is busy. Try again.");
    this.mine = mergeSocial(this.mine, [e]).slice(-MAX);
    this.merge([e]);
    const epoch = this.scope;
    this.writes = this.writes.catch(() => {}).then(() => this.persist(epoch));
    void this.writes.catch(() => {});
    return e;
  }
  vote(message: string, vote: 1 | -1 | 0) {
    return this.emit({ kind: "vote", message, vote });
  }
  post(cards: SocialCard[]) {
    return this.emit({ kind: "post", cards: cards.slice(0, 3) });
  }
  offer(parent: SocialEntry, cards: SocialCard[], target = parent.player) {
    const peers = Object.values(multiplayer.snapshot().peers);
    if (!peers.some((p) => p.profile.playerId === target))
      throw Error("Both collectors must be online to offer.");
    return this.emit({
      kind: "offer",
      parent: parent.kind === "post" ? parent.id : parent.parent,
      target,
      cards: cards.slice(0, 3),
    });
  }
  private async persist(epoch: number) {
    if (!this.profile || epoch !== this.scope) return;
    const id = ("ms_" + this.profile.playerId).slice(0, 40),
      player = this.profile.playerId,
      room = this.room;
    let revision = this.revision;
    try {
      const r = await multiplayer.request("/data/social/" + id);
      revision = r.record?.revision ?? 0;
      const d = r.record?.data;
      if (d?.player === player && d.room === room)
        this.mine = mergeSocial(d.entries ?? [], this.mine).slice(-MAX);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
    if (epoch !== this.scope) return;
    const entries = [...this.mine];
    const data = { kind: "mini-social", player, room, entries };
    const budget = recordLimit(multiplayer.snapshot().schema, "social");
    while (
      entries.length &&
      new TextEncoder().encode(JSON.stringify(data)).length > budget
    )
      entries.shift();
    if (!entries.length) return;
    const r = await multiplayer.request("/data/social/" + id, {
      method: "PUT",
      body: JSON.stringify({ data, expectedRevision: revision }),
    });
    if (epoch === this.scope)
      this.revision = r.record?.revision ?? revision + 1;
  }
}
export const social = new SocialService();

export function useSocial(game: Game) {
  const network = useSyncExternalStore(
    multiplayer.subscribe,
    multiplayer.snapshot,
  );
  useEffect(() => {
    if (!game.profile) return;
    social.bind(game.profile);
    return () => social.stop();
  }, [game.profile?.playerId, network.room]);
  return useSyncExternalStore(social.subscribe, social.snapshot);
}
