import type { SocialCard } from "../game/social";
import { bestCopy } from "../game/copies";
import {
  useEffect,
  useRef,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  Coins,
  Gift,
  Target,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { Game } from "../services/useGame";
import type { SetDefinition } from "../game/types";
import { allCards, sets, cardById } from "../game/catalogue";
import { utcDay, claimDaily, missions, level } from "../game/engine";
import {
  makeBinders,
  binderOwned,
  binderAcceptsFinish,
  earnedBadges,
} from "../game/binders";
import { cardLabel, pullFinish } from "../game/finishes";
import {
  useOwnedPrices,
  formatCardPrice,
  useCollectionValue,
} from "../services/pricing";
import { CardView } from "./CardView";
import { BoosterPack } from "./BoosterPack";
import "../styles/mini.css";
type ReadyGame = Game & {
  save: NonNullable<Game["save"]>;
  profile: NonNullable<Game["profile"]>;
};
export function CollectionValue({ game }: { game: Game }) {
  const v = useCollectionValue(game.save!);
  return (
    <div className="mini-value">
      <span>COLLECTION VALUE</span>
      <b>
        {v.usd
          ? "$" + v.usd.toFixed(2)
          : v.eur
            ? "€" + v.eur.toFixed(2)
            : v.loading
              ? "Checking…"
              : "$0.00"}
        {v.usd && v.eur ? ` + €${v.eur.toFixed(2)}` : ""}
      </b>
      <small>
        {v.loading
          ? v.usd || v.eur
            ? "Refreshing market references…"
            : "Finding market references…"
          : v.unknown
            ? `${v.unknown} unpriced · references only`
            : "Market references · not coin value"}
      </small>
    </div>
  );
}
export function Badges({ ids = [] }: { ids?: string[] }) {
  const b = makeBinders(allCards);
  return (
    <span className="mini-badges">
      {ids.map((id) => {
        const badge = b.find((b) => b.id === id);
        return badge ? (
          <span
            className="gym-badge"
            title={badge.name + " gym badge"}
            aria-label={badge.name + " gym badge"}
            style={{ "--badge": badge.color } as CSSProperties}
            key={id}
          >
            {badge.icon}
          </span>
        ) : null;
      })}
    </span>
  );
}
export function Home({
  game,
  onBuy,
  onMissions,
  onCards,
  onEarn,
}: {
  game: ReadyGame;
  onBuy: (s: SetDefinition, productId?: string) => void;
  onMissions: () => void;
  onCards: () => void;
  onEarn?: () => void;
}) {
  const s = game.save,
    prices = useOwnedPrices(s),
    recent = [...s.owned]
      .filter((c) => (prices[c.cardId + ":" + c.finish]?.usd ?? 0) >= 10)
      .sort((a, b) => b.obtainedAt - a.obtainedAt)
      .slice(0, 5),
    daily = s.lastFreePack === utcDay(),
    badges = earnedBadges(s, allCards);
  return (
    <div className="page mini-home">
      {!daily && (
        <section className="mini-daily">
          <div>
            <small>YOUR DAILY FREE PACK</small>
            <h1>
              Crack the
              <br />
              <em>extraordinary.</em>
            </h1>
            <button
              className="primary"
              disabled={game.busy}
              onClick={() =>
                onBuy(
                  sets.find((s) => s.id === "mini-all")!,
                  "daily",
                )
              }
            >
              {s.pending ? "CONTINUE PACK" : "CLAIM FREE PACK"}{" "}
              <Gift size={15} />
            </button>
          </div>
          <div className="mini-daily-pack">
            <BoosterPack set={sets[0]} small />
          </div>
        </section>
      )}
      <div className="mini-greeting">
        <h2>
          {daily ? "Welcome back, collector ♡" : "Tiny packs. Big feelings."}
        </h2>
        <small>
          {new Set(s.owned.map((c) => c.cardId)).size} discoveries · LV.{" "}
          {level(s.xp)} <Badges ids={badges} />
        </small>
      </div>
      <CollectionValue game={game} />
      <div className="mini-actions">
        <button
          className="mini-tile"
          disabled={game.busy || s.lastClaim === utcDay()}
          onClick={() => void game.update(claimDaily).catch(() => {})}
        >
          <Gift size={18} />
          <span>
            {s.lastClaim === utcDay()
              ? "DAILY CREDITS CLAIMED"
              : "DAILY CREDITS +1000"}
          </span>
        </button>
        <button className="mini-tile" onClick={onMissions}>
          <Target size={18} />
          <span>COLLECTOR MISSIONS</span>
          <b>
            {missions(s).filter((m) => m.value >= m.target && !m.claimed)
              .length || "→"}
          </b>
        </button>
        <button className="mini-tile earn-coins-tile" onClick={onEarn}>
          <Sparkles size={18} />
          <span>EARN CREDITS · PLAY</span>
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="section-title">
        <h2>Your last 5 big hits</h2>
        <button className="text-button" onClick={onCards}>
          BINDERS →
        </button>
      </div>
      <div className="recent-row">
        {recent.length ? (
          recent.map((c) => (
            <button key={c.instanceId} onClick={onCards}>
              <CardView
                card={cardById.get(c.cardId)}
                finish={c.finish}
                ham={c.ham}
              />
              <small>
                {prices[c.cardId + ":" + c.finish]
                  ? formatCardPrice(prices[c.cardId + ":" + c.finish].price)
                  : ""}
              </small>
            </button>
          ))
        ) : (
          <p className="big-hit-empty">
            Your $10+ discoveries land here. Keep ripping ♡
          </p>
        )}
      </div>
      <p className="mini-motto">
        11 favourites. Every little art obsession. uwu ✧
      </p>
    </div>
  );
}
export function Shop({
  game,
  onBuy,
  onOdds,
}: {
  game: ReadyGame;
  onBuy: (s: SetDefinition, productId?: string) => void;
  onOdds: (s: SetDefinition, productId?: string) => void;
}) {
  const [confirm, setConfirm] = useState<SetDefinition | null>(null);
  return (
    <div className="page mini-shop">
      <div className="mini-section-line">
        <h2>Pick your pack ♡</h2>
        <small>5 cards · 1 rare+</small>
      </div>
      <div className="mini-pack-grid">
        {sets.map((s) => (
          <article
            className="mini-pack"
            style={{ "--accent": s.color } as CSSProperties}
            key={s.id}
          >
            <button
              className="mini-pack-buy"
              disabled={
                game.busy || (!game.save.pending && game.save.coins < s.price)
              }
              onClick={() => (game.save.pending ? onBuy(s) : setConfirm(s))}
              aria-label={`Buy ${s.name} for ${s.price} coins`}
            >
              <div className="mini-pack-heading">
                <b>{s.title}</b>
                <span>
                  <Coins size={12} />
                  {s.price}
                </span>
              </div>
              <BoosterPack set={s} small />
              <small>
                {s.id === "mini-holo" ? "5 HOLOS · " : ""}
                {s.total} collectible cards
              </small>
            </button>
            <button
              className="text-button"
              onClick={() => onOdds(s, "standard")}
            >
              POOL & ODDS ↗
            </button>
          </article>
        ))}
      </div>
      <p className="fine-print">
        Prototype packs draw from the focused catalogue. Each includes a rare+
        card. Tap a pack to buy.
      </p>
      {confirm && (
        <div
          className="mini-confirm"
          role="dialog"
          aria-label="Confirm pack purchase"
        >
          <h3>{confirm.name}</h3>
          <p>
            Five {confirm.id === "mini-holo" ? "holo cards" : "cards"} for{" "}
            {confirm.price} coins?
          </p>
          <button
            className="primary full"
            disabled={game.busy}
            onClick={() => {
              onBuy(confirm);
              setConfirm(null);
            }}
          >
            CONFIRM BUY · {confirm.price}
          </button>
          <button className="secondary full" onClick={() => setConfirm(null)}>
            KEEP BROWSING
          </button>
        </div>
      )}
    </div>
  );
}
export function Collection({
  game,
  onInspect,
}: {
  game: ReadyGame;
  onInspect: (id: string, preview?: SocialCard) => void;
}) {
  const binders = useMemo(() => makeBinders(allCards), []),
    [id, setId] = useState<string | null>(null),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState("all"),
    [limit, setLimit] = useState(48),
    [byValue, setByValue] = useState(false),
    [byCopies, setByCopies] = useState(false),
    [columns, setColumns] = useState<3 | 4>(4);
  const sentinel = useRef<HTMLDivElement>(null);
  const prices = useOwnedPrices(game.save);
  useEffect(() => {
    setLimit(48);
  }, [id, filter, byValue, byCopies]);
  useEffect(() => {
    if (!sentinel.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + 48);
      },
      {
        root: sentinel.current.closest(".page-scroll"),
        rootMargin: "0px 0px 250px 0px",
      },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [id, limit, filter, q, byValue, byCopies]);
  const s = game.save,
    b =
      id === "ham10"
        ? {
            id: "ham10",
            name: "HAM 10 TROPHY VAULT",
            icon: "♛",
            color: "#ffe8a0",
            cards: s.owned
              .filter((o) => o.ham === 10)
              .map((o) => ({
                ...cardById.get(o.cardId)!,
                galleryInstanceId: o.instanceId,
              }))
              .filter(Boolean),
          }
        : binders.find((b) => b.id === id),
    owned = new Map(s.owned.map((o) => [o.cardId, o]));
  const badges = earnedBadges(s, allCards);
  const completed =
    b?.id === "ham10"
      ? new Set(b.cards.map((c) => c.id))
      : b
        ? new Set(binderOwned(b, s, allCards).map((c) => c.id))
        : new Set<string>();
  const copiesFor = (
    c: import("../game/types").CardDefinition & { galleryInstanceId?: string },
  ) =>
    s.owned.filter(
      (o) =>
        binderAcceptsFinish(id ?? "all", o.finish) &&
        (id === "ham10"
          ? o.instanceId === c.galleryInstanceId
          : o.cardId === c.id ||
            (id !== "japanese" &&
              (cardById.get(o.cardId)?.artId ?? o.cardId) ===
                (c.artId ?? c.id))),
    );
  const cards =
    b?.cards
      .filter(
        (c) =>
          (c.name + " " + c.species).toLowerCase().includes(q.toLowerCase()) &&
          (filter === "all" ||
            (filter === "owned" ? completed.has(c.id) : !completed.has(c.id))),
      )
      .filter((c) => !(byValue || byCopies) || completed.has(c.id))
      .sort((a, b) => {
        if (byCopies) return copiesFor(b).length - copiesFor(a).length;
        if (!byValue) return 0;
        const value = (c: typeof a) => {
          const copies = copiesFor(c);
          return Math.max(
            -1,
            ...copies.map((o) => prices[o.cardId + ":" + o.finish]?.usd ?? -1),
          );
        };
        return value(b) - value(a);
      }) ?? [];
  return (
    <div className="page mini-collection">
      {!b ? (
        <>
          <div className="mini-section-line">
            <h2>Your badge quest</h2>
            <Badges ids={badges} />
          </div>
          <CollectionValue game={game} />
          <div className="mini-binder-list">
            <button
              className="mini-binder ham-vault"
              onClick={() => setId("ham10")}
            >
              <span className="gym-badge">♛</span>
              <span>
                <b>HAM 10 TROPHY VAULT</b>
                <small>
                  {s.owned.filter((o) => o.ham === 10).length} perfect cards ·
                  show them off
                </small>
              </span>
              <span>→</span>
            </button>
            {binders.map((b) => {
              const n = binderOwned(b, s, allCards).length;
              return (
                <button
                  key={b.id}
                  className="mini-binder"
                  onClick={() => {
                    setId(b.id);
                    setLimit(48);
                    setQ("");
                  }}
                  style={{ "--badge": b.color } as CSSProperties}
                >
                  <span
                    className={`gym-badge ${badges.includes(b.id) ? "earned" : ""}`}
                  >
                    {b.icon}
                  </span>
                  <span>
                    <b>{b.name}</b>
                    <small>
                      {n}/{b.cards.length} ·{" "}
                      {badges.includes(b.id)
                        ? "BADGE EARNED"
                        : "complete to earn badge"}
                    </small>
                    <i className="progress">
                      <i style={{ width: `${(n / b.cards.length) * 100}%` }} />
                    </i>
                  </span>
                  <span>→</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="binder-toolbar">
            <div className="mini-section-line">
              <button
                className="icon-button"
                aria-label="Back to binders"
                onClick={() => setId(null)}
              >
                <ArrowLeft size={18} />
              </button>
              <h2>{b.name}</h2>
              <small>
                {completed.size}/{b.cards.length}
              </small>
            </div>
            <div className="mini-filter">
              <input
                aria-label="Search cards"
                placeholder="Find a favourite…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setLimit(48);
                }}
              />
              {["all", "owned", "missing"].map((f) => (
                <button
                  className={filter === f ? "active" : ""}
                  onClick={() => setFilter(f)}
                  key={f}
                >
                  {f}
                </button>
              ))}
              <button
                className={byValue ? "active" : ""}
                aria-pressed={byValue}
                onClick={() => {
                  setByValue((v) => !v);
                  setByCopies(false);
                }}
              >
                VALUE ↓ · OWNED
              </button>
              <button
                className={byCopies ? "active" : ""}
                aria-pressed={byCopies}
                onClick={() => {
                  setByCopies((v) => !v);
                  setByValue(false);
                }}
              >
                COPIES ↓ · OWNED
              </button>
              <button
                onClick={() => setColumns((n) => (n === 4 ? 3 : 4))}
                aria-label={`Cards per row: ${columns}. Switch to ${columns === 4 ? 3 : 4}.`}
              >
                {columns} ACROSS ↔
              </button>
            </div>
          </div>
          <div
            className="binder-grid"
            style={{ "--binder-columns": columns } as CSSProperties}
          >
            {cards.slice(0, limit).map((c, slotIndex) => {
              const copies = copiesFor(c);
              const own = bestCopy(copies);
              const shown = own ? cardById.get(own.cardId)! : c;
              const finish =
                own?.finish ??
                (b.id === "reverse"
                  ? "reverse"
                  : b.id === "holo"
                    ? "holo"
                    : pullFinish(c));
              return (
                <button
                  className={`binder-slot ${completed.has(c.id) ? "owned" : "missing"}`}
                  key={c.id + (b.id === "ham10" ? slotIndex : "")}
                  onClick={() =>
                    onInspect(
                      own?.instanceId ?? c.id,
                      own
                        ? undefined
                        : { instanceId: "", cardId: c.id, finish },
                    )
                  }
                  aria-label={`${c.species} ${c.language} ${completed.has(c.id) ? "owned" : "missing"}`}
                >
                  <CardView card={shown} ham={own?.ham} finish={finish} />
                  <small>{c.species}</small>
                  <small>
                    {shown.language?.toUpperCase()} · {cardLabel(shown, finish)}
                  </small>
                  {byValue && own && (
                    <small>
                      {prices[own.cardId + ":" + own.finish]
                        ? formatCardPrice(
                            prices[own.cardId + ":" + own.finish].price,
                          )
                        : "Unpriced"}
                    </small>
                  )}
                  {copies.length > 0 && (
                    <b
                      className="mini-owned"
                      aria-label={`${copies.length} copies owned`}
                    >
                      {copies.length}
                    </b>
                  )}
                </button>
              );
            })}
          </div>
          {cards.length > limit && (
            <div ref={sentinel} className="binder-sentinel" role="status">
              Loading more art…
            </div>
          )}
          {!cards.length && (
            <p className="fine-print">No cards match this view.</p>
          )}
        </>
      )}
    </div>
  );
}
