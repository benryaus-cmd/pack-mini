import foilOpen from "../assets/audio/foil-open.mp3?inline";
import foilCrinkle from "../assets/audio/foil-crinkle.mp3?inline";
import cardFlick from "../assets/audio/card-flick.mp3?inline";
import { Howl, Howler } from "howler";
import type { Settings } from "../game/types.ts";
export type Cue =
  | "tap"
  | "rip"
  | "crinkle"
  | "flip"
  | "coin"
  | "rare"
  | "epic"
  | "new"
  | "duplicate"
  | "mission"
  | "slide";
const palette: Record<Cue, number[]> = {
  tap: [620],
  crinkle: [100],
  rip: [90, 140, 220, 80],
  flip: [340, 540],
  coin: [880, 1174, 1568],
  rare: [220, 440, 554, 659, 880],
  epic: [110, 220, 330, 440, 554, 659, 880, 1320],
  new: [660, 880],
  duplicate: [240],
  mission: [523, 659, 784, 1046],
  slide: [160, 220],
};
function wav(notes: number[], noise = false, music = false) {
  const rate = 22050,
    duration = music ? 8 : noise ? 0.5 : notes.length * 0.09 + 0.18,
    count = Math.floor(rate * duration),
    buffer = new ArrayBuffer(44 + count * 2),
    v = new DataView(buffer);
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + count * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    let sample = 0;
    if (music) {
      const env = Math.sin((Math.PI * t) / duration) ** 2;
      sample =
        notes.reduce((n, f) => n + Math.sin(2 * Math.PI * f * t) * 0.025, 0) *
        env;
    } else if (noise) {
      sample =
        (Math.random() * 2 - 1) *
        0.23 *
        Math.exp(-t * 6) *
        Math.sin(t * 130) ** 2;
    } else {
      for (let n = 0; n < notes.length; n++) {
        const d = t - n * 0.09;
        if (d >= 0)
          sample +=
            Math.sin(2 * Math.PI * notes[n] * d) * Math.exp(-d * 18) * 0.16;
      }
    }
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}
class AudioBus {
  private sounds = new Map<Cue, Howl>();
  private music: Howl | null = null;
  private unlocked = false;
  private settings: Settings | null = null;
  apply(s: Settings) {
    this.settings = s;
    Howler.volume(s.muted ? 0 : s.master);
    this.sounds.forEach((sound) => sound.volume(s.sfx));
    this.music?.volume(s.music);
    if (
      this.unlocked &&
      !s.muted &&
      s.music > 0 &&
      !document.hidden &&
      !this.music?.playing()
    )
      this.music?.play();
    if (s.muted || s.music === 0) this.music?.pause();
  }
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) Howler.mute(true);
      else {
        Howler.mute(false);
        if (this.settings) this.apply(this.settings);
      }
    });
  }
  play(cue: Cue) {
    if (!this.unlocked || this.settings?.muted) return;
    let sound = this.sounds.get(cue);
    if (!sound) {
      sound = new Howl({
        src: [
          cue === "rip"
            ? foilOpen
            : cue === "crinkle"
              ? foilCrinkle
              : cue === "flip" || cue === "slide"
                ? cardFlick
                : wav(palette[cue]),
        ],
        format: [
          cue === "flip" || cue === "slide" || cue === "crinkle"
            ? "mp3"
            : "wav",
        ],
        volume: this.settings?.sfx ?? 0.7,
      });
      this.sounds.set(cue, sound);
    }
    if (cue === "flip" || cue === "slide" || cue === "crinkle")
      sound.rate(0.92 + Math.random() * 0.16);
    sound.play();
  }
}
export const audio = new AudioBus();
export function haptic(pattern: number | number[], enabled = true) {
  if (enabled && navigator.vibrate) navigator.vibrate(pattern);
}
