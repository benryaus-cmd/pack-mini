import { DEFAULT_HOST } from "./protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUserInfo } from "@aippy/runtime/user";
import type { Profile, Save } from "../game/types";
import { applicationProfile, multiplayer } from "./multiplayer";
import { loadSave, transact, watchSave } from "./persistence";
import { earnedBadges } from "../game/binders";
import { allCards } from "../game/catalogue";
import { level } from "../game/engine";
export function useGame() {
  const user = useUserInfo();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [save, setSave] = useState<Save | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (user.isLoading) return;
    let alive = true;
    setSave(null);
    setProfile(null);
    current.current = null;
    multiplayer.disconnect();
    applicationProfile(user)
      .then(async (p) => {
        if (!alive) return;
        current.current = p.playerId;
        setProfile(p);
        const loaded = await loadSave(p.playerId);
        if (alive) {
          setSave(loaded);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(`Could not load your collection: ${e.message}`);
      });
    return () => {
      alive = false;
    };
  }, [
    user.isLoading,
    user.uid,
    user.username,
    user.nickName,
    user.avatar,
    retry,
  ]);
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    const stop = watchSave(
      profile.playerId,
      () =>
        void loadSave(profile.playerId).then((s) => {
          if (alive) setSave(s);
        }),
    );
    return () => {
      alive = false;
      stop();
    };
  }, [profile]);
  const update = useCallback(async (fn: (s: Save) => Save) => {
    const key = current.current;
    if (!key) throw Error("Profile is loading");
    setBusy(true);
    try {
      const result = await transact(key, fn);
      if (current.current === key) setSave(result);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (profile && save)
      multiplayer.setCollector({
        profile,
        badges: earnedBadges(save, allCards),
        level: level(save.xp),
        cards: save.owned.length,
        unique: new Set(save.owned.map((c) => c.cardId)).size,
        showcaseCards: save.showcase
          .map((id) => save.owned.find((c) => c.instanceId === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c) => ({ cardId: c.cardId, finish: c.finish, ham: c.ham })),
        showcase: save.showcase
          .map((id) => save.owned.find((c) => c.instanceId === id)?.cardId)
          .filter((x): x is string => !!x),
      });
  }, [profile, save]);
  useEffect(() => {
    if (!profile || !save) return;
    try {
      localStorage.removeItem("packmini-host");
    } catch {}
    multiplayer.connect(DEFAULT_HOST, "mini-lobby");
    return () => multiplayer.disconnect();
  }, [profile?.playerId, !!save]);
  return {
    profile,
    save,
    busy,
    error,
    setError,
    update,
    retry: () => setRetry((n) => n + 1),
    profileLoading: user.isLoading,
  };
}
export type Game = ReturnType<typeof useGame>;
