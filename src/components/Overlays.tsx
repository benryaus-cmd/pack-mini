import type { SocialCard } from "../game/social";
import { copyRank } from "../game/copies";
import { cardLabel, finishLabel } from "../game/finishes";
import { lockedTradeIds } from "../game/trading";
import { achievements, claimAchievement } from "../game/achievements";
import {
  productById,
  productCost,
  slotPool,
  guaranteeLabel,
} from "../game/products";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Coins,
  Check,
  Eye,
  Gift,
  Heart,
  Layers,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  Zap,
} from "lucide-react";
import type { Game } from "../services/useGame";
import type { Settings, SetDefinition, Save } from "../game/types";
import { cardById, setById, allCards, imageUrl, sets } from "../game/catalogue";
import {
  missions,
  claimMission,
  claimStudy,
  cardKey,
  favourite,
  showcase,
  recycle,
  tierNames,
  prototypeWeights,
} from "../game/engine";
import { audio, haptic } from "../services/audio";
import { gradeCard, hamMultiplier } from "../game/grading";
import { trading } from "../services/trading";
import { multiplayer } from "../services/multiplayer";
import { CardView, CardPrice } from "./CardView";
export function Inspector({
  id,
  game,
  onRecycle,
  onSelectCopy,
  preview,
}: {
  id: string;
  game: Game;
  onRecycle: (id: string) => void;
  onSelectCopy?: (id: string) => void;
  preview?: SocialCard;
}) {
  const save = game.save!;
  const own = save.owned.find((c) => c.instanceId === id);
  const card = cardById.get(own?.cardId ?? id);
  const [zoom, setZoom] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeNotice, setGradeNotice] = useState("");
  useEffect(() => setGradeNotice(""), [id]);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [motionError, setMotionError] = useState("");
  const [sensorGranted, setSensorGranted] = useState(() => {
    const sensor = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;
    return Boolean(sensor && !sensor.requestPermission);
  });
  useEffect(() => {
    if (!gradeNotice) return;
    const timer = setTimeout(() => setGradeNotice(""), 2200);
    return () => clearTimeout(timer);
  }, [gradeNotice]);
  const tilt = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!motionEnabled || !sensorGranted) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const el = tilt.current?.querySelector<HTMLElement>(".card-view");
    if (!el) return;
    const root = el.closest(".game-root");
    const reset = () => {
      for (const [name, value] of [
        ["--rx", "0deg"],
        ["--ry", "0deg"],
        ["--mx", "50%"],
        ["--my", "50%"],
      ])
        el.style.setProperty(name, value);
    };
    function sensor(e: DeviceOrientationEvent) {
      if (query.matches || root?.classList.contains("reduced-motion")) {
        reset();
        return;
      }
      if (e.gamma === null || e.beta === null) return;
      const x = Math.max(-1, Math.min(1, e.gamma / 25));
      const y = Math.max(-1, Math.min(1, (e.beta - 45) / 25));
      el!.style.setProperty("--ry", `${x * 30}deg`);
      el!.style.setProperty("--rx", `${-y * 30}deg`);
      el!.style.setProperty("--mx", `${50 + x * 45}%`);
      el!.style.setProperty("--my", `${50 + y * 45}%`);
    }
    const observer = new MutationObserver(() => {
      if (root?.classList.contains("reduced-motion")) reset();
    });
    if (root)
      observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    query.addEventListener("change", reset);
    window.addEventListener("deviceorientation", sensor);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", reset);
      window.removeEventListener("deviceorientation", sensor);
      reset();
    };
  }, [motionEnabled, sensorGranted, id]);
  if (!card) return <p>This card is unavailable.</p>;
  const set = setById.get(card.setId)!;
  const display = own ?? preview;
  const copies = save.owned
    .filter(
      (c) =>
        c.cardId === card.id ||
        (card.artId && cardById.get(c.cardId)?.artId === card.artId),
    )
    .sort((a, b) => copyRank(b) - copyRank(a) || b.obtainedAt - a.obtainedAt);
  const canRecycle =
    own &&
    !save.pending?.instances.includes(own.instanceId) &&
    !save.queued.some((p) => p.instances.includes(own.instanceId)) &&
    !lockedTradeIds(save).has(own.instanceId);
  async function share() {
    const text = `I discovered ${card!.name} in PACK MINI! ${set.name} · ${card!.rarity}`;
    try {
      if (navigator.share)
        await navigator.share({ title: "PACK MINI discovery", text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
    } catch {
      /* Share cancellation leaves the collection unchanged. */
    }
  }
  return (
    <div className="inspector">
      {own?.ham === 10 && gradeNotice && (
        <div className="ham-ten-party" aria-hidden="true">
          <span>♛</span>
          <b>PERFECT 10!</b>
          <small>You absolute legend ♡</small>
        </div>
      )}
      <div
        ref={tilt}
        className={`inspect-art ${zoom ? "zoomed" : ""}`}
        onDoubleClick={() => setZoom((v) => !v)}
      >
        <CardView
          card={card}
          ham={display?.ham}
          finish={display?.finish ?? (card.holo ? "holo" : "matte")}
          interactive
          large
          key={card.id}
        />
      </div>
      {own && copies.length > 1 && (
        <div className="copy-selector" aria-label="Choose physical copy">
          <small>
            {copies.length} COPIES · SELECT THE ONE TO GRADE OR SELL
          </small>
          <div>
            {copies.map((c, i) => (
              <button
                key={c.instanceId}
                aria-pressed={c.instanceId === id}
                onClick={() => onSelectCopy?.(c.instanceId)}
              >
                <b>{c.ham ? `HAM ${c.ham}` : "UNGRADED"}</b>
                <span>
                  {finishLabel(c.finish)} ·{" "}
                  {cardById.get(c.cardId)?.language?.toUpperCase()} · #{i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <span className={`rarity-badge tier-${card.tier}`}>
        ✦{" "}
        {cardLabel(
          card,
          display?.finish ?? (card.holo ? "holo" : "gloss"),
        ).toUpperCase()}
      </span>
      <h2>{card.name}</h2>
      <p>
        {set.name} · #{card.localId}/{set.total}
      </p>
      <div className="inspect-value-grade">
        <CardPrice
          compact
          cardId={card.id}
          ham={display?.ham}
          finish={display?.finish ?? (card.holo ? "holo" : "matte")}
        />
        {display && (
          <section
            className={`ham-panel ${display.ham === 10 ? "perfect" : ""}`}
          >
            <div>
              <b>{display.ham ? `HAM ${display.ham}` : "UNGRADED"}</b>
              <span>
                {Math.round(hamMultiplier(display.ham) * 100)}% market sale
                value
              </span>
            </div>
            {display.ham ? (
              <p>
                {display.ham === 10
                  ? "✦ PERFECT TEN. Absolute collector royalty. ✦"
                  : "Graded and locked in. This rating travels with your card."}
              </p>
            ) : own ? (
              <>
                <button
                  className="primary full"
                  disabled={game.busy || grading}
                  onClick={() => {
                    setGrading(true);
                    void game
                      .update((s) => gradeCard(s, id))
                      .then((s) => {
                        const grade = s.owned.find(
                          (c) => c.instanceId === id,
                        )?.ham;
                        setGradeNotice(
                          grade === 10
                            ? "✦ HAM 10 — PERFECT! Into the trophy vault!"
                            : `HAM ${grade} — graded!`,
                        );
                        audio.play(grade === 10 ? "epic" : "rare");
                        if (grade === 10) haptic([40, 30, 80], true);
                      })
                      .catch(() => {})
                      .finally(() => setGrading(false));
                  }}
                >
                  FREE HAM GRADE · ONE ROLL
                </button>
                <small>
                  7:35% · 8:35% · 9:25% · 10:5%. A 7 lowers the sale value. One
                  grade per card.
                </small>
              </>
            ) : (
              <p>Shared card · not owned</p>
            )}
            {gradeNotice && (
              <p role="status" className="ham-celebration">
                {gradeNotice}
              </p>
            )}
          </section>
        )}
      </div>
      {own && (
        <button
          className="primary full sell-card"
          disabled={!canRecycle || game.busy}
          onClick={() => onRecycle(own.instanceId)}
        >
          SELL CARD · {own.ham ? `HAM ${own.ham}` : "UNGRADED"} ·{" "}
          {finishLabel(own.finish).toUpperCase()}
        </button>
      )}
      <div className="inspect-details">
        <span>
          PRINTED RARITY<b>{card.rarity}</b>
        </span>
        <span>
          FINISH
          <b>
            {display
              ? finishLabel(display.finish)
              : card.holo
                ? "Holo"
                : "Catalogue preview"}
          </b>
        </span>
        <span>
          OWNED
          <b>
            {copies.length} {copies.length === 1 ? "copy" : "copies"}
          </b>
        </span>
        <span>
          DISCOVERED
          <b>
            {own
              ? new Date(own.obtainedAt).toLocaleDateString()
              : "Waiting for you"}
          </b>
        </span>
      </div>
      {own && (
        <div className="inspector-actions">
          <button
            className={save.favourites.includes(id) ? "selected" : ""}
            onClick={() =>
              void game.update((s) => favourite(s, id)).catch(() => {})
            }
          >
            <Heart
              size={18}
              fill={save.favourites.includes(id) ? "currentColor" : "none"}
            />{" "}
            FAVOURITE
          </button>
          <button
            className={save.showcase.includes(id) ? "selected" : ""}
            onClick={() =>
              void game.update((s) => showcase(s, id)).catch(() => {})
            }
          >
            <Eye size={18} /> SHOWCASE
          </button>
          <button onClick={() => void share()}>
            <Share2 size={18} /> SHARE
          </button>
        </div>
      )}
      <p className="fine-print">
        Drag to catch the light. Double-tap to zoom.
        <br />
        Gloss and foil respond to the light.
      </p>
      {"DeviceOrientationEvent" in window && (
        <button
          className="text-button"
          onClick={() => {
            if (sensorGranted) {
              setMotionEnabled((v) => !v);
              return;
            }
            const sensor = DeviceOrientationEvent as unknown as {
              requestPermission?: () => Promise<string>;
            };
            void (sensor.requestPermission?.() ?? Promise.resolve("granted"))
              .then((result) => {
                if (result === "granted") {
                  setSensorGranted(true);
                  setMotionEnabled(true);
                  setMotionError("");
                } else
                  setMotionError(
                    "Motion permission was not granted. Drag the card to tilt.",
                  );
              })
              .catch(() =>
                setMotionError("Motion is unavailable. Drag the card to tilt."),
              );
          }}
        >
          {sensorGranted && motionEnabled ? "DISABLE" : "ENABLE"} MOTION TILT
        </button>
      )}
      {motionError && (
        <p className="fine-print" role="status">
          {motionError}
        </p>
      )}
      {canRecycle && (
        <button className="secondary full" onClick={() => onRecycle(id)}>
          SELL CARD · MARKET OFFER <Coins size={15} />
        </button>
      )}
    </div>
  );
}
export function MissionPanel({
  game,
  onStudy,
}: {
  game: Game;
  onStudy: () => void;
}) {
  const s = game.save!;
  const awards = achievements(s, sets);
  return (
    <>
      <div className="mission-intro">
        <Target size={30} />
        <h2>A reason to rip.</h2>
        <p>Small discoveries. Meaningful rewards.</p>
      </div>
      <div className="mission-list">
        {missions(s).map((m) => (
          <article
            className={`mission-row ${m.claimed ? "claimed" : ""}`}
            key={m.id}
          >
            <div className="mission-icon">
              {m.period === "weekly" ? (
                <Trophy size={20} />
              ) : m.id === "inspect" ? (
                <Eye size={20} />
              ) : (
                <Sparkles size={20} />
              )}
            </div>
            <div>
              <span className="eyebrow">{m.period.toUpperCase()}</span>
              <b>{m.label}</b>
              <small>
                {Math.min(m.target, m.value)} / {m.target}
              </small>
              <div className="progress">
                <i
                  style={{
                    width: `${Math.min(100, (m.value / m.target) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <button
              disabled={m.claimed || m.value < m.target || game.busy}
              onClick={() =>
                void game
                  .update((x) => claimMission(x, m.id))
                  .then(() => audio.play("mission"))
                  .catch(() => {})
              }
            >
              {m.claimed ? (
                <Check size={17} />
              ) : (
                <>
                  <Coins size={13} />
                  {m.reward}
                </>
              )}
            </button>
          </article>
        ))}
      </div>
      <details className="achievement-book">
        <summary>
          <Trophy size={18} />
          <span>COLLECTOR ACHIEVEMENTS</span>
          <b>
            {awards.filter((a) => a.claimed).length}/{awards.length}
          </b>
          <small>
            {awards.filter((a) => !a.claimed && a.value >= a.target).length}{" "}
            READY
          </small>
        </summary>
        <p>
          Set milestones count unique printed cards. Rare-pull achievements
          remember your best discovery. Each reward can be claimed once.
        </p>
        <div className="mission-list">
          {awards.map((a) => (
            <article
              className={`mission-row achievement-row ${a.claimed ? "claimed" : ""}`}
              key={a.id}
            >
              <div className="mission-icon">
                <Trophy size={18} />
              </div>
              <div>
                <b>{a.label}</b>
                <small>
                  {Math.min(a.value, a.target)} / {a.target} ·{" "}
                  {a.setId ? "UNIQUE CARDS" : "RARITY TIER"}
                </small>
                <div className="progress">
                  <i
                    style={{
                      width: `${Math.min(100, (a.value / a.target) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <button
                aria-label={`Claim ${a.label}`}
                disabled={a.claimed || a.value < a.target || game.busy}
                onClick={() =>
                  void game
                    .update((s) => claimAchievement(s, a.id, sets))
                    .then(() => audio.play("mission"))
                    .catch(() => {})
                }
              >
                {a.claimed ? (
                  <Check size={16} />
                ) : (
                  <>
                    <Coins size={13} />
                    {a.reward}
                  </>
                )}
              </button>
            </article>
          ))}
        </div>
      </details>
      <div className="study-promo">
        <div>
          <span className="eyebrow">COLLECTOR’S EYE</span>
          <h3>A sharp eye pays off.</h3>
          <p>
            Match six pairs with four lives to earn 250 credits.
            <br />
            Up to 20 rewards a day · 30s rest between wins.
          </p>
        </div>
        <button className="primary" onClick={onStudy}>
          PLAY & EARN <ArrowIcon />
        </button>
      </div>
      <p className="fine-print">
        Daily missions reset at 00:00 UTC. Weekly missions reset on Monday at
        00:00 UTC.
      </p>
    </>
  );
}
function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}
export function Study({ game, onDone }: { game: Game; onDone: () => void }) {
  const [round, setRound] = useState(0);
  return (
    <StudyRound
      key={round}
      game={game}
      onDone={onDone}
      onRetry={() => setRound((n) => n + 1)}
    />
  );
}
function StudyRound({
  game,
  onDone,
  onRetry,
}: {
  game: Game;
  onDone: () => void;
  onRetry: () => void;
}) {
  const deck = useMemo(() => {
    const pool = game.save!.owned.length
      ? game.save!.owned.map((o) => cardById.get(o.cardId)!).filter(Boolean)
      : allCards.slice(0, 16);
    const unique = [...new Map(pool.map((c) => [c.id, c])).values()];
    for (const card of allCards) {
      if (unique.length >= 6) break;
      if (!unique.some((c) => c.id === card.id)) unique.push(card);
    }
    const picked = unique.slice(-6);
    const shuffled = [...picked, ...picked].map((card, i) => ({
      card,
      key: i,
    }));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);
  const [selected, setSelected] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [won, setWon] = useState(false);
  const [lives, setLives] = useState(4);
  const claimLock = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (selected.length !== 2) return;
    const [a, b] = selected;
    if (deck[a].card.id === deck[b].card.id) {
      setMatched((m) => [...m, a, b]);
      setSelected([]);
      audio.play("new");
    } else {
      const t = setTimeout(() => {
        setLives((remaining) => Math.max(0, remaining - 1));
        setSelected([]);
      }, 650);
      return () => clearTimeout(t);
    }
  }, [selected, deck]);
  const complete = matched.length === 12;
  const lost = lives === 0;
  return (
    <div className="study-game">
      <span className="eyebrow">COLLECTOR’S EYE</span>
      <h2>
        {won
          ? "Sharp eyes. Nice coins."
          : complete
            ? "Beautifully spotted."
            : lost
              ? "Out of lives. Try again."
              : "Find the six pairs."}
      </h2>
      <p>Match all six pairs. Each mismatch costs one life.</p>
      <p
        role="status"
        aria-live="polite"
        aria-label={`${lives} lives remaining`}
      >
        {"♥".repeat(lives)}
        {"♡".repeat(4 - lives)} · {matched.length / 2}/6 PAIRS
      </p>
      <div
        className="study-grid"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}
      >
        {deck.map(({ card }, i) => (
          <button
            key={i}
            disabled={
              selected.length === 2 ||
              selected.includes(i) ||
              matched.includes(i) ||
              won ||
              lost
            }
            aria-label={`Memory card ${i + 1}`}
            onClick={() => {
              if (!selected.includes(i)) {
                setSelected((x) => [...x, i]);
                audio.play("flip");
              }
            }}
            className={matched.includes(i) ? "matched" : ""}
          >
            <CardView
              card={card}
              back={!selected.includes(i) && !matched.includes(i)}
            />
          </button>
        ))}
      </div>
      {lost && (
        <button className="primary full" onClick={onRetry}>
          TRY AGAIN
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {complete && (
        <button
          className="primary"
          disabled={won || game.busy}
          onClick={() => {
            if (claimLock.current) return;
            claimLock.current = true;
            void game
              .update((s) => claimStudy(s))
              .then(() => {
                setWon(true);
                audio.play("coin");
              })
              .catch((e) => {
                claimLock.current = false;
                setError(e.message);
              });
          }}
        >
          {won ? (
            <>
              <Check size={16} /> 250 CREDITS ADDED
            </>
          ) : (
            <>
              CLAIM 250 <Coins size={16} />
            </>
          )}
        </button>
      )}
      <button className="text-button" onClick={onDone}>
        {lost ? "BACK TO ARCADE · TRY A NEW ROUND" : "BACK TO ARCADE"}
      </button>
    </div>
  );
}
export function Odds({
  set,
  productId = "standard",
}: {
  set: SetDefinition;
  productId?: string;
}) {
  const product = productById(productId)!;
  return (
    <div className="odds">
      <span className="eyebrow">{set.era.toUpperCase()} COLLECTION</span>
      <h2>{product.name}</h2>
      <p>
        {set.name} · {product.packs} pack{product.packs > 1 ? "s" : ""} ×{" "}
        {product.count} cards from {set.total} real definitions.{" "}
        {guaranteeLabel(product, set)}.
      </p>
      <h3>Every slot · prototype rates</h3>
      {product.slots.map((slot, i) => {
        const pool = slotPool(slot, set),
          tiers = [...new Set(pool.map((c) => c.tier))].sort(),
          total = tiers.reduce(
            (n, t) => n + (slot.weighted ? (prototypeWeights[t] ?? 1) : 1),
            0,
          );
        return (
          <div className="slot-odds" key={i}>
            <h3>
              SLOT {i + 1} · {slot.name.toUpperCase()}
            </h3>
            {tiers.map((t) => (
              <div className="odds-row" key={t}>
                <span className={`rarity tier-${t}`}>{tierNames[t]}</span>
                <strong>
                  {(
                    ((slot.weighted ? (prototypeWeights[t] ?? 1) : 1) / total) *
                    100
                  ).toFixed(2)}
                  %
                </strong>
              </div>
            ))}
          </div>
        );
      })}
      <p>
        Within each selected tier, eligible cards have equal probability. Ultra
        guarantees fall back to rare-or-better in legacy sets without ultra-tier
        definitions. Bundle rates repeat per pack. The reverse slot adds a
        prototype finish.
      </p>
      <div className="notice">
        <ShieldCheck size={22} />
        <p>
          These are game prototype rates, not authentic sealed-product odds.
          Original printed rarity is shown in the inspector. Finishes are
          prototype display treatments.
        </p>
      </div>
      <small>
        Price: {productCost(product, set) || "FREE"} coins · All copies are
        saved before the first reveal. Daily Free Pack: once per UTC day.
      </small>
    </div>
  );
}
export function SettingsPanel({
  settings,
  onChange,
  save,
  networkStatus,
  onOpenProjectFiles,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  save: Save;
  networkStatus: string;
  onOpenProjectFiles?: () => void;
}) {
  const update = (patch: Partial<Settings>) =>
    onChange({ ...settings, ...patch });
  return (
    <div className="settings-panel">
      <span className="eyebrow">MAKE IT YOURS</span>
      <h3>Sound & feel</h3>
      {(["master", "music", "sfx"] as const).map((key) => (
        <label className="slider-setting" key={key}>
          <span>
            {key === "sfx"
              ? "Sound effects"
              : key[0].toUpperCase() + key.slice(1)}
            <b>{Math.round(settings[key] * 100)}%</b>
          </span>
          <input
            aria-label={`${key} volume`}
            type="range"
            min="0"
            max="1"
            step=".01"
            value={settings[key]}
            onChange={(e) => update({ [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="toggle">
        <span>Mute audio</span>
        <input
          type="checkbox"
          checked={settings.muted}
          onChange={(e) => update({ muted: e.target.checked })}
        />
      </label>
      <label className="toggle">
        <span>Haptic feedback</span>
        <input
          type="checkbox"
          checked={settings.haptics}
          onChange={(e) => {
            update({ haptics: e.target.checked });
            haptic(15, e.target.checked);
          }}
        />
      </label>
      <h3>Performance</h3>
      <label className="toggle">
        <span>Graphics quality</span>
        <select
          aria-label="Graphics quality"
          value={settings.graphics}
          onChange={(e) =>
            update({ graphics: e.target.value as Settings["graphics"] })
          }
        >
          <option>AUTO</option>
          <option>HIGH</option>
          <option>LOW</option>
        </select>
      </label>
      <label className="toggle">
        <span>Reduced motion</span>
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(e) => update({ reducedMotion: e.target.checked })}
        />
      </label>
      <label className="toggle">
        <span>Diagnostics</span>
        <input
          type="checkbox"
          checked={settings.diagnostics}
          onChange={(e) => update({ diagnostics: e.target.checked })}
        />
      </label>
      <div className="notice">
        <Layers size={20} />
        <p>
          Your {save.owned.length} cards and {save.coins} coins are saved on
          this device. Online showcases are public; the server currently
          provides social storage, not cross-device ownership or verified
          balances.
        </p>
      </div>
      <button
        className="secondary full"
        onClick={() => {
          const blob = new Blob([JSON.stringify(save, null, 2)], {
              type: "application/json",
            }),
            url = URL.createObjectURL(blob),
            link = document.createElement("a");
          link.href = url;
          link.download = "pack-mini-backup.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        EXPORT COLLECTION BACKUP
      </button>
      {onOpenProjectFiles && (
        <button className="secondary full" onClick={onOpenProjectFiles}>
          temp save
        </button>
      )}
      <p className="fine-print">
        PACK MINI 1.0 · {networkStatus}
        <br />
        TCGdex data. Pokémon artwork is temporary prototype content.
        <br />
        Build and asset credits are included in the repository.
      </p>
    </div>
  );
}
