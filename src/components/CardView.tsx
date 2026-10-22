import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CardDefinition, Finish } from "../game/types";
import { CARD_BACK_URL, cardImageSources } from "../services/cardAssets";
import { formatCardPrice, useCardPrice } from "../services/pricing";
import "../styles/card-experience.css";
import { finishLabel } from "../game/finishes";
import { Sparkles } from "lucide-react";
export function CardView({
  card,
  finish = card?.holo ? "holo" : "matte",
  ham,
  interactive = false,
  back = false,
  large = false,
  onClick,
  className = "",
}: {
  ham?: 7 | 8 | 9 | 10;
  card?: CardDefinition;
  finish?: Finish;
  interactive?: boolean;
  back?: boolean;
  large?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [backFailed, setBackFailed] = useState(false);
  const sources = card ? cardImageSources(card, finish) : [];
  const [loaded, setLoaded] = useState(false);
  const [highLoaded, setHighLoaded] = useState(false);
  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
    setLoaded(false);
    setHighLoaded(false);
  }, [card?.id]);
  function tilt(e: React.PointerEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect(),
      x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    ref.current.style.setProperty(
      "--rx",
      `${interactive ? (0.5 - y) * 22 : 0}deg`,
    );
    ref.current.style.setProperty(
      "--ry",
      `${interactive ? (x - 0.5) * 24 : 0}deg`,
    );
    ref.current.style.setProperty("--mx", `${x * 100}%`);
    ref.current.style.setProperty("--my", `${y * 100}%`);
  }
  function reset() {
    if (!ref.current) return;
    ref.current.style.setProperty("--rx", "0deg");
    ref.current.style.setProperty("--ry", "0deg");
  }
  return (
    <div
      ref={ref}
      className={`card-view ${ham === 10 ? "ham-perfect" : ""} ${back ? "card-back" : ""} finish-${finish} ${card && card.tier >= 4 ? "foil-full" : "foil-window"} ${interactive ? "interactive" : ""} ${className}`}
      style={{ "--card-hue": `${(card?.tier ?? 0) * 48}deg` } as CSSProperties}
      data-finish={finishLabel(finish)}
      onPointerDown={tilt}
      onPointerMove={tilt}
      onPointerLeave={reset}
      onPointerUp={reset}
      onClick={onClick}
    >
      {back ? (
        <>
          {!backFailed && (
            <img
              src={CARD_BACK_URL}
              alt="Pokémon trading card back"
              draggable={false}
              onError={() => setBackFailed(true)}
            />
          )}
          <div className="back-design" aria-hidden="true">
            <div className="back-orbit" />
            <Sparkles />
            <b>POKÉMON</b>
            <small>TRADING CARD GAME</small>
          </div>
        </>
      ) : (
        <>
          {card?.image && !failed && (
            <img
              src={sources[sourceIndex]}
              alt={card.name}
              loading={large ? "eager" : "lazy"}
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={() => {
                if (sourceIndex + 1 < sources.length)
                  setSourceIndex(sourceIndex + 1);
                else setFailed(true);
              }}
            />
          )}
          {large && card?.image && (
            <img
              className="high-resolution"
              src={`${card.finishImages?.[finish] ?? card.image}/high.webp`}
              alt=""
              aria-hidden="true"
              draggable={false}
              style={{ opacity: highLoaded ? 1 : 0 }}
              onLoad={() => setHighLoaded(true)}
            />
          )}
          {((!loaded && !highLoaded) ||
            (failed && !highLoaded) ||
            !card?.image) && (
            <div className={`card-fallback type-${card?.type.toLowerCase()}`}>
              <small>
                {card?.localId} / {card?.setId.toUpperCase()}
              </small>
              <Sparkles />
              <b>{card?.name ?? "Undiscovered"}</b>
              <span>
                {failed
                  ? "Artwork unavailable"
                  : (card?.rarity ?? "YOUR NEXT DISCOVERY")}
              </span>
            </div>
          )}
          <div className="foil" />
          <div className="card-glare" />
          <div className="card-grain" />
          {ham && (
            <span className={`ham-marker ham-${ham}`} aria-label={`HAM ${ham}`}>
              HAM <b>{ham}</b>
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** A marketplace reference for the physical card, never an in-game coin value. */
export function CardPrice({
  cardId,
  finish = "matte",
  compact = false,
}: {
  cardId: string;
  compact?: boolean;
  ham?: 7 | 8 | 9 | 10;
  finish?: Finish;
}) {
  const { price, loading } = useCardPrice(cardId, finish);
  return (
    <span
      className={`card-market-price ${compact ? "compact" : ""}`}
      title={
        price
          ? `${price.variant} · ${price.updated ? `Updated ${new Date(price.updated).toLocaleDateString()}` : "Latest available snapshot"}`
          : undefined
      }
    >
      {loading ? (
        compact ? (
          "…"
        ) : (
          "Checking market…"
        )
      ) : price ? (
        <>
          <b>
            {price.estimated ? "≈" : ""}
            {formatCardPrice(price)}
          </b>{" "}
          {!compact && <small>{price.source} · reference</small>}
        </>
      ) : compact ? (
        "—"
      ) : (
        "Market price unavailable"
      )}
    </span>
  );
}
