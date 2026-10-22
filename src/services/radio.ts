/// <reference types="vite/client" />
import { requestMixableAudio } from "./audioPolicy.js";
export const STATIONS = [
  {
    id: "poptron",
    name: "PopTron",
    mood: "Electric pop · bright energy",
    url: "https://ice5.somafm.com/poptron-128-mp3",
  },
  {
    id: "vaporwaves",
    name: "Vaporwaves",
    mood: "Vaporwave · pastel daydreams",
    url: "https://ice5.somafm.com/vaporwaves-128-mp3",
  },
  {
    id: "indiepop",
    name: "Indie Pop Rocks!",
    mood: "Indie pop · fresh discoveries",
    url: "https://ice1.somafm.com/indiepop-128-mp3",
  },
  {
    id: "groovesalad",
    name: "Groove Salad",
    mood: "Downtempo · soft focus",
    url: "https://ice1.somafm.com/groovesalad-128-mp3",
  },
  {
    id: "beatblender",
    name: "Beat Blender",
    mood: "Deep house · after hours",
    url: "https://ice1.somafm.com/beatblender-128-mp3",
  },
] as const;
export type RadioState = {
  station: string;
  status: "paused" | "loading" | "playing" | "error";
};
export interface RadioMedia extends EventTarget {
  src: string;
  volume: number;
  preload: string;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}
const clamp = (n: number) =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
/** One media element survives React panel navigation. No constructor/effect plays audio. */
export class RadioController {
  private media: RadioMedia | null = null;
  private state: RadioState = { station: "poptron", status: "paused" };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;
  private requested = false;
  private level = 0.4;
  private handlers: Array<[string, EventListener]> = [
    [
      "playing",
      () => {
        if (this.requested && !this.media?.paused) {
          this.clearTimer();
          this.update("playing");
        }
      },
    ],
    [
      "waiting",
      () => {
        if (this.requested) {
          this.update("loading");
          this.armTimer();
        }
      },
    ],
    [
      "stalled",
      () => {
        if (this.requested) {
          this.update("loading");
          this.armTimer();
        }
      },
    ],
    ["error", () => this.fail()],
    [
      "pause",
      () => {
        // HTML media queues pause events. A failure or newer play can supersede them.
        if (this.state.status === "error" || !this.media?.paused) return;
        this.requested = false;
        this.request++;
        this.clearTimer();
        this.update("paused");
      },
    ],
    [
      "ended",
      () => {
        this.requested = false;
        this.clearTimer();
        this.update("paused");
      },
    ],
  ];
  constructor(
    private factory: () => RadioMedia = () => new Audio(),
    private timeout = 15000,
  ) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  private update(status: RadioState["status"]) {
    this.state = { ...this.state, status };
    this.emit();
  }
  private clearTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private armTimer() {
    this.clearTimer();
    this.timer = setTimeout(() => this.fail(), this.timeout);
  }
  private fail() {
    this.requested = false;
    this.request++;
    this.clearTimer();
    this.media?.pause();
    this.update("error");
  }
  select(id: string) {
    if (!STATIONS.some((s) => s.id === id) || id === this.state.station) return;
    this.pause();
    this.state = { station: id, status: "paused" };
    // Release old live connection. Selection never starts a network request.
    if (this.media) {
      this.media.removeAttribute("src");
      this.media.load();
    }
    this.emit();
  }
  volume(n: number) {
    this.level = clamp(n);
    if (this.media) this.media.volume = this.level;
  }
  play() {
    const token = ++this.request;
    try {
      requestMixableAudio();
      if (!this.media) {
        this.media = this.factory();
        this.media.preload = "none";
        this.handlers.forEach(([event, fn]) =>
          this.media!.addEventListener(event, fn),
        );
      }
      const station = STATIONS.find((s) => s.id === this.state.station)!;
      if (this.media.src !== station.url) this.media.src = station.url;
      if (this.state.status === "error") this.media.load();
      this.media.volume = this.level;
      this.requested = true;
      this.update("loading");
      this.armTimer();
      void this.media.play().catch(() => {
        if (token === this.request) this.fail();
      });
    } catch {
      if (token === this.request) this.fail();
    }
  }
  pause() {
    this.requested = false;
    this.request++;
    this.clearTimer();
    this.media?.pause();
    this.update("paused");
  }
  dispose() {
    this.pause();
    if (this.media) {
      this.handlers.forEach(([event, fn]) =>
        this.media!.removeEventListener(event, fn),
      );
      this.media.removeAttribute("src");
      this.media.load();
      this.media = null;
    }
    this.listeners.clear();
  }
}
export const radio = new RadioController();
if (import.meta.hot) import.meta.hot.dispose(() => radio.dispose());
