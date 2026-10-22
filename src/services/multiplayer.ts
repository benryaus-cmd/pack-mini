import { generateId } from "../game/uuid.ts";
import type { Profile, Finish } from "../game/types.ts";
import {
  DEFAULT_HOST,
  gamePath,
  profileHeader,
  mergeMessages,
  parseHello,
  recordLimit,
  type ChatMessage,
  type Collector,
} from "./protocol.ts";
export interface NetworkState {
  status: "offline" | "connecting" | "online" | "retrying";
  error: string;
  connectionId: string;
  peers: Record<string, Collector>;
  badgesByPlayer: Record<string, string[]>;
  messages: ChatMessage[];
  feed: {
    id: string;
    name: string;
    cardId: string;
    at: number;
    finish?: Finish;
    ham?: 7 | 8 | 9 | 10;
  }[];
  config: unknown;
  schema: unknown;
  discovered: boolean;
  room: string;
  population: number;
}
export class ApiError extends Error {
  status: number;
  retryAfter: number;
  constructor(status: number, message: string, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export class Multiplayer {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<
    (event: string, data: unknown, from: string) => void
  >();
  onEvent(fn: (event: string, data: unknown, from: string) => void) {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  }
  private generation = 0;
  private retries = 0;
  private active = false;
  private identity: Collector | null = null;
  private sentAt = 0;
  private outbound: { event: string; body: string }[] = [];
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private clearOutbound() {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    this.outbound = [];
    this.sentAt = 0;
  }
  private flush() {
    this.sendTimer = null;
    if (this.socket?.readyState !== 1) {
      this.clearOutbound();
      return;
    }
    const wait = 100 - (Date.now() - this.sentAt);
    if (wait > 0) {
      this.sendTimer = setTimeout(() => this.flush(), wait);
      return;
    }
    const next = this.outbound.shift();
    if (next) {
      this.socket.send(next.body);
      this.sentAt = Date.now();
    }
    if (this.outbound.length)
      this.sendTimer = setTimeout(() => this.flush(), 100);
  }

  private lastChat = 0;
  private lastPublish = 0;
  private cooldown = 0;
  private discovery: Promise<void> | null = null;
  private controller = new AbortController();
  private handshake: ReturnType<typeof setTimeout> | null = null;
  private scope() {
    return {
      generation: this.generation,
      host: this.host,
      playerId: this.identity?.profile.playerId,
    };
  }
  private current(scope: ReturnType<Multiplayer["scope"]>) {
    return (
      scope.generation === this.generation &&
      scope.host === this.host &&
      scope.playerId === this.identity?.profile.playerId
    );
  }
  private requireCurrent(scope: ReturnType<Multiplayer["scope"]>) {
    if (!this.current(scope))
      throw Error("Connection or profile changed. Try again.");
  }

  private state: NetworkState = {
    status: "offline",
    error: "",
    connectionId: "",
    peers: {},
    badgesByPlayer: {},
    messages: [],
    feed: [],
    config: null,
    schema: null,
    discovered: false,
    room: "mini-lobby",
    population: 0,
  };
  host = DEFAULT_HOST;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private patch(p: Partial<NetworkState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }
  setCollector(c: Collector) {
    if (
      this.identity &&
      this.identity.profile.playerId !== c.profile.playerId
    ) {
      this.disconnect();
      this.patch({ messages: [], feed: [] });
    }
    this.identity = c;
    if (this.state.status === "online") this.send("hello", c);
  }
  async request(
    path: string,
    options: RequestInit = {},
    identity = this.identity?.profile,
  ) {
    if (Date.now() < this.cooldown)
      throw new ApiError(429, "Server is resting. Try again shortly.");
    const scope = this.scope();
    const response = await fetch(gamePath("api", this.host) + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(identity ? { "X-Player-Profile": profileHeader(identity) } : {}),
        ...options.headers,
      },
      signal:
        options.signal ??
        AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]),
    });
    this.requireCurrent(scope);
    if (!response.ok) {
      const retry = Number(response.headers.get("Retry-After")) || 10;
      if (response.status === 429) this.cooldown = Date.now() + retry * 1000;
      const messages: Record<number, string> = {
        401: "Profile was not accepted. Reconnect to refresh it.",
        403: "This record belongs to another profile.",
        409: "Record changed. Refresh and retry.",
        429: "Server is resting. Try again shortly.",
        507: "Server storage is full. Your local collection is safe.",
      };
      throw new ApiError(
        response.status,
        messages[response.status] ??
          `Server request failed (${response.status})`,
        retry,
      );
    }
    const result = await response.json();
    this.requireCurrent(scope);
    return result;
  }
  async discover() {
    if (this.state.discovered) return;
    if (this.discovery) return this.discovery;
    const scope = this.scope();
    const task = (async () => {
      try {
        const [config, schema] = await Promise.all([
          this.request("/config"),
          fetch(scope.host + "/api/v1/schema", {
            signal: AbortSignal.any([
              this.controller.signal,
              AbortSignal.timeout(10000),
            ]),
          }).then((r) => {
            if (!r.ok) throw Error("Schema unavailable");
            return r.json();
          }),
        ]);
        if (this.current(scope))
          this.patch({ config, schema, discovered: true });
      } finally {
        if (this.current(scope)) this.discovery = null;
      }
    })();
    this.discovery = task;
    return task;
  }
  connect(host = this.host, room = this.state.room) {
    this.disconnect();
    this.host = host.replace(/\/$/, "");
    this.active = true;
    const generation = ++this.generation;
    this.patch({
      status: "connecting",
      error: "",
      room,
      peers: {},
      messages: [],
      feed: [],
      discovered: false,
      config: null,
      schema: null,
    });
    void this.discover().catch(() => {});
    this.open(generation);
  }
  private open(generation: number) {
    if (!this.active || generation !== this.generation) return;
    this.patch({ status: this.retries ? "retrying" : "connecting" });
    let ws: WebSocket;
    try {
      ws = new WebSocket(gamePath("ws", this.host, this.state.room));
    } catch {
      this.failed(generation);
      return;
    }
    this.socket = ws;
    const timeout = (this.handshake = setTimeout(() => {
      if (ws.readyState === 0) ws.close();
    }, 10000));
    ws.onmessage = (e) => {
      if (generation !== this.generation) return;
      try {
        if (typeof e.data === "string" && e.data.length <= 20480)
          this.accept(JSON.parse(e.data));
      } catch {
        /* Ignore malformed relay data. */
      }
    };
    ws.onerror = () =>
      this.patch({ error: "Connection unavailable. Solo play is ready." });
    ws.onclose = (e) => {
      clearTimeout(timeout);
      if (generation !== this.generation) return;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.clearOutbound();
      this.patch({ status: "offline", peers: {}, population: 0 });
      if (e.code === 1008 || e.code === 4003) {
        this.patch({
          error: "Server full. Retrying automatically; local play is ready.",
        });
        this.retries = Math.max(4, this.retries);
      }
      this.failed(generation);
    };
    ws.onopen = () => clearTimeout(timeout);
  }
  private failed(generation: number) {
    if (!this.active || generation !== this.generation) return;
    this.patch({
      status: "retrying",
      error: "Reconnecting… your cards are saved on this device.",
    });
    this.timer = setTimeout(
      () => this.open(generation),
      Math.min(30000, 2000 * 2 ** Math.min(this.retries++, 4)) +
        Math.random() * 500,
    );
  }
  disconnect() {
    this.active = false;
    this.generation++;
    this.clearOutbound();
    this.controller.abort();
    this.controller = new AbortController();
    this.discovery = null;
    if (this.handshake) clearTimeout(this.handshake);
    this.handshake = null;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
    this.socket = null;
    this.retries = 0;
    this.patch({
      status: "offline",
      peers: {},
      connectionId: "",
      population: 0,
    });
  }
  send(event: string, data: unknown) {
    if (event === "pull") void this.publishPull(data);
    if (this.socket?.readyState !== 1) return false;
    const body = JSON.stringify({ type: "event", event, data });
    if (new TextEncoder().encode(body).length > 1800) return false;
    const pending =
      event === "hello" || event === "snapshot"
        ? this.outbound.find((m) => m.event === event)
        : undefined;
    if (pending) pending.body = body;
    else {
      if (this.outbound.length >= 30) return false;
      this.outbound.push({ event, body });
    }
    if (!this.sendTimer) this.flush();
    return true;
  }
  private accept(m: any) {
    if (!m || typeof m !== "object") return;
    if (m.type === "welcome" && typeof m.id === "string") {
      this.retries = 0;
      this.patch({
        status: "online",
        connectionId: m.id,
        error: "",
        population: Number(m.playersInRoom) || 1,
      });
      if (this.identity) this.send("hello", this.identity);
      void this.history();
      void this.loadPulls();
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (this.identity) this.send("hello", this.identity);
      }, 15000);
      return;
    }
    if (m.type === "joined") {
      this.patch({ population: this.state.population + 1 });
      if (this.identity) this.send("hello", this.identity);
      return;
    }
    if (m.type === "left" && typeof m.id === "string") {
      const peers = { ...this.state.peers };
      delete peers[m.id];
      this.patch({ peers, population: Math.max(1, this.state.population - 1) });
      return;
    }
    if (m.type === "chat") {
      this.patch({ messages: mergeMessages(this.state.messages, [m.message]) });
      return;
    }
    if (
      m.type === "event" &&
      typeof m.from === "string" &&
      m.from !== this.state.connectionId
    ) {
      this.eventListeners.forEach((fn) => fn(m.event, m.data, m.from));
      if (m.event === "hello" || m.event === "snapshot") {
        const c = parseHello(m.data);
        if (c) {
          const isNew = !this.state.peers[m.from];
          this.patch({
            peers: { ...this.state.peers, [m.from]: c },
            badgesByPlayer: {
              ...this.state.badgesByPlayer,
              [c.profile.playerId]: c.badges ?? [],
            },
          });
          if (isNew && this.identity) this.send("snapshot", this.identity);
        }
      }
      if (
        m.event === "pull" &&
        typeof m.data?.id === "string" &&
        typeof m.data?.cardId === "string" &&
        this.state.peers[m.from]
      ) {
        const f = {
          id: m.data.id.slice(0, 60),
          cardId: m.data.cardId.slice(0, 50),
          finish: m.data.finish,
          ham: m.data.ham,
          name: this.state.peers[m.from].profile.nickName,
          at: Date.now(),
        };
        if (!this.state.feed.some((x) => x.id === f.id))
          this.patch({ feed: [f, ...this.state.feed].slice(0, 10) });
      }
    }
  }
  private pullWrites: Promise<void> = Promise.resolve();
  private async publishPull(value: unknown) {
    const d = value as {
      id?: string;
      cardId?: string;
      finish?: Finish;
      ham?: 7 | 8 | 9 | 10;
    };
    if (
      !this.identity ||
      typeof d?.id !== "string" ||
      typeof d.cardId !== "string"
    )
      return;
    const scope = this.scope(),
      profile = this.identity.profile;
    const entry = {
      id: d.id.slice(0, 60),
      cardId: d.cardId.slice(0, 50),
      finish: d.finish,
      ham: d.ham,
      name: profile.nickName,
      at: Date.now(),
    };
    this.patch({
      feed: [entry, ...this.state.feed.filter((f) => f.id !== entry.id)].slice(
        0,
        10,
      ),
    });
    this.pullWrites = this.pullWrites
      .catch(() => {})
      .then(async () => {
        this.requireCurrent(scope);
        await this.discover();
        this.requireCurrent(scope);
        const id = "mp_" + profile.playerId;
        let revision = 0,
          entries: NetworkState["feed"] = [];
        try {
          const r = await this.request("/data/social/" + id);
          revision = r.record?.revision ?? 0;
          if (Array.isArray(r.record?.data?.entries))
            entries = r.record.data.entries;
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 404) throw e;
        }
        entries = [entry, ...entries.filter((e) => e.id !== entry.id)].slice(
          0,
          10,
        );
        const data = { kind: "pull-feed", entries };
        const budget = recordLimit(this.state.schema, "social");
        while (
          entries.length > 1 &&
          new TextEncoder().encode(JSON.stringify(data)).length > budget
        )
          entries.pop();
        await this.request("/data/social/" + id, {
          method: "PUT",
          body: JSON.stringify({ data, expectedRevision: revision }),
        });
      });
    await this.pullWrites.catch(() => {});
  }
  async loadPulls() {
    try {
      const r = await this.request("/data/social");
      const entries = (Array.isArray(r.records) ? r.records : [])
        .flatMap((r: any) =>
          r.data?.kind === "pull-feed" && Array.isArray(r.data.entries)
            ? r.data.entries
            : r.data?.kind === "pull"
              ? [r.data]
              : [],
        )
        .filter(
          (d: any) =>
            d &&
            typeof d.id === "string" &&
            typeof d.cardId === "string" &&
            typeof d.name === "string" &&
            Number.isFinite(d.at),
        );
      const merged = new Map(
        [...entries, ...this.state.feed].map((d: any) => [d.id, d]),
      );
      this.patch({
        feed: [...merged.values()]
          .sort((a: any, b: any) => b.at - a.at)
          .slice(0, 10) as NetworkState["feed"],
      });
    } catch {
      /* Live relay remains available while public storage recovers. */
    }
  }
  async history() {
    const scope = this.scope();
    try {
      const r = await this.request("/chat/" + this.state.room);
      if (!this.current(scope)) return;
      this.patch({
        messages: mergeMessages(
          this.state.messages,
          Array.isArray(r.messages) ? r.messages : [],
        ),
      });
    } catch (e) {
      if (!this.current(scope)) return;
      this.patch({ error: (e as Error).message });
    }
  }
  async chat(text: string) {
    const scope = this.scope();
    if (this.state.status !== "online") throw Error("Join the lounge to chat");
    if (!text.trim() || text.trim().length > 280)
      throw Error("Write a message up to 280 characters");
    if (Date.now() - this.lastChat < 1200)
      throw Error("Give your last message a moment");
    this.lastChat = Date.now();
    const r = await this.request("/chat/" + this.state.room, {
      method: "POST",
      body: JSON.stringify({ text: text.trim() }),
    });
    this.requireCurrent(scope);
    this.patch({ messages: mergeMessages(this.state.messages, [r.message]) });
  }
  async leaderboard(period: "daily" | "all-time" = "daily") {
    return this.request(
      `/leaderboards?board=mini_collection&period=${period}&limit=25&offset=0&playerId=${this.identity?.profile.playerId ?? ""}`,
    );
  }
  async publish() {
    if (!this.identity) throw Error("Profile is loading");
    if (Date.now() - this.lastPublish < 15000)
      throw Error("Showcase saved recently. Try again in a moment.");
    const scope = this.scope();
    const identity = this.identity;
    await this.discover();
    this.requireCurrent(scope);
    const host = this.host;
    const profile = identity.profile;
    const id = "m_" + profile.playerId;
    const body = {
      ...identity,
      profile: { ...profile, avatar: profile.avatar.slice(0, 300) },
    };
    const budget = recordLimit(this.state.schema, "social");
    if (new TextEncoder().encode(JSON.stringify(body)).length > budget)
      body.profile.avatar = "";
    if (new TextEncoder().encode(JSON.stringify(body)).length > budget) {
      body.profile.nickName = body.profile.nickName.slice(0, 16);
      body.profile.username = body.profile.username.slice(0, 16);
    }
    if (new TextEncoder().encode(JSON.stringify(body)).length > budget)
      throw Error(
        "Showcase exceeds the discovered record limit. Use fewer showcase cards.",
      );
    let revision = 0;
    try {
      const old = await this.request("/data/social/" + id, {}, profile);
      revision = old.record?.revision ?? 0;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
    this.requireCurrent(scope);
    await this.request(
      "/data/social/" + id,
      {
        method: "PUT",
        body: JSON.stringify({ data: body, expectedRevision: revision }),
      },
      profile,
    );
    this.requireCurrent(scope);
    await this.request(
      "/scores",
      {
        method: "POST",
        body: JSON.stringify({
          board: "mini_collection",
          score: identity.unique,
        }),
      },
      profile,
    );
    this.requireCurrent(scope);
    this.lastPublish = Date.now();
  }
  async findProfile(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,38}$/.test(id))
      throw Error("Enter a valid collector ID");
    const scope = this.scope();
    const r = await this.request("/data/social/m_" + id);
    this.requireCurrent(scope);
    const collector = parseHello(r.record?.data);
    if (!collector) throw Error("No published collector profile");
    return collector;
  }
}
export const multiplayer = new Multiplayer();
export async function applicationProfile(user: {
  uid?: string;
  username?: string;
  nickName?: string;
  avatar?: string;
}): Promise<Profile> {
  if (user.uid) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(user.uid),
    );
    const id =
      "a_" +
      Array.from(new Uint8Array(digest).slice(0, 16))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    return {
      playerId: id,
      username: user.username ?? "",
      nickName: user.nickName || user.username || "Collector",
      avatar: user.avatar ?? "",
    };
  }
  let id = localStorage.getItem("packmini-browser-id");
  if (!id) {
    id = "b_" + generateId();
    localStorage.setItem("packmini-browser-id", id);
  }
  return {
    playerId: id,
    username: "collector_" + id.slice(-5),
    nickName: "Collector " + id.slice(-4).toUpperCase(),
    avatar: "",
  };
}
