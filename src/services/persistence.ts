import type { Save, Settings } from "../game/types.ts";
import { initialSave } from "../game/engine.ts";
const DB = "packmini-v1";
let database: Promise<IDBDatabase> | null = null;
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("saves");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export function validateSave(raw: unknown): Save {
  if (!raw || typeof raw !== "object") throw Error("Save is invalid");
  const s = raw as Save;
  if (
    s.version !== 1 ||
    !Array.isArray(s.owned) ||
    !Number.isSafeInteger(s.coins) ||
    s.coins < 0 ||
    !s.daily ||
    !s.stats ||
    !Array.isArray(s.claims)
  )
    throw Error("Save version is not supported");
  if (!s.dropBatch && s.pendingDrops?.length)
    s.dropBatch = {
      ids: s.pendingDrops.map((b) => b.id),
      startedAt: Math.min(...s.pendingDrops.map((b) => b.startedAt)),
    };
  s.queued ??= [];
  s.lastFreePack ??= "";
  if (s.pending) {
    s.pending.productId ??= "standard";
    s.pending.packOrdinal ??= 1;
    s.pending.packCount ??= 1;
  }
  return s;
}
export async function loadSave(key: string): Promise<Save> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("saves", "readonly");
    const r = tx.objectStore("saves").get(key);
    r.onsuccess = () => {
      try {
        resolve(r.result ? validateSave(r.result) : initialSave());
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
/** Read, mutate and persist in one IndexedDB write transaction: serializes other tabs. */
export async function transact(
  key: string,
  fn: (save: Save) => Save,
): Promise<Save> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("saves", "readwrite");
    const store = tx.objectStore("saves");
    const get = store.get(key);
    let result: Save;
    let failure: unknown;
    get.onsuccess = () => {
      try {
        const current = get.result ? validateSave(get.result) : initialSave();
        result = fn(current);
        result = { ...result, revision: current.revision + 1 };
        store.put(result, key);
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      resolve(result);
      channel?.postMessage(key);
    };
    tx.onabort = () =>
      reject(
        failure ??
          tx.error ??
          Error("Could not save. Your purchase was not charged."),
      );
    tx.onerror = () => {
      failure ??= tx.error;
    };
  });
}
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("packmini-saves")
    : null;
export function watchSave(key: string, callback: () => void) {
  const onMessage = (e: MessageEvent) => {
    if (e.data === key) callback();
  };
  channel?.addEventListener("message", onMessage);
  return () => channel?.removeEventListener("message", onMessage);
}
export const defaultSettings: Settings = {
  master: 0.65,
  music: 0,
  sfx: 0.7,
  muted: false,
  graphics: "AUTO",
  reducedMotion: false,
  haptics: true,
  diagnostics: false,
};
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("packmini-settings") || "{}");
    const settings = { ...defaultSettings, ...s };
    for (const key of ["master", "music", "sfx"] as const)
      settings[key] = Number.isFinite(settings[key])
        ? Math.max(0, Math.min(1, settings[key]))
        : defaultSettings[key];
    return settings;
  } catch {
    return { ...defaultSettings };
  }
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem("packmini-settings", JSON.stringify(s));
  } catch {
    /* Session preferences remain usable. */
  }
}
