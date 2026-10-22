import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  Bell,
  ArrowRight,
  BookOpen,
  Check,
  Coins,
  Gift,
  Home as HomeIcon,
  Layers,
  PackageOpen,
  Settings as SettingsIcon,
  ShoppingBag,
  Sparkles,
  Target,
  Users,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { allCards } from "./game/catalogue";
import { Badges } from "./components/Pages";
import { hamMultiplier } from "./game/grading";
import { badgesLost, earnedBadges } from "./game/binders";
import { sellCard, type SaleQuote } from "./game/selling";
import { saleQuote } from "./services/pricing";
import { RadioButton } from "./components/Radio";
import { useSocial } from "./services/social";
import { useGame } from "./services/useGame";
import { generateId } from "./game/uuid";
import { useTrading } from "./services/trading";
import { Arcade } from "./components/Arcade";
import { Trades } from "./components/Trades";
import { sets, cardById, setById, totalCards } from "./game/catalogue";
import type { SetDefinition, Settings, Save } from "./game/types";
import {
  purchase,
  inspect,
  recycle,
  level,
  levelProgress,
} from "./game/engine";
import { loadSettings, saveSettings } from "./services/persistence";
import { audio } from "./services/audio";
import { multiplayer } from "./services/multiplayer";
import { Home, Shop, Collection } from "./components/Pages";
import { Social, Avatar } from "./components/Social";
import { Modal } from "./components/Modal";
import { Opening } from "./components/Opening";
import {
  Inspector,
  MissionPanel,
  Study,
  Odds,
  SettingsPanel,
} from "./components/Overlays";
type Page = "home" | "shop" | "rip" | "cards" | "social";
type Overlay =
  | "missions"
  | "settings"
  | "study"
  | "arcade"
  | "chat"
  | "trades"
  | "offers"
  | null;
export default function App({
  onOpenProjectFiles,
}: { onOpenProjectFiles?: () => void } = {}) {
  const game = useGame();
  const trade = useTrading(game);
  const miniSocial = useSocial(game);
  const [page, setPage] = useState<Page>("home");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [recycleId, setRecycleId] = useState<string | null>(null);
  const [sellQuote, setSellQuote] = useState<SaleQuote | null>(null);
  const [saleError, setSaleError] = useState("");
  const [saleLoading, setSaleLoading] = useState(false);
  const [odds, setOdds] = useState<{
    set: SetDefinition;
    productId: string;
  } | null>(null);
  const [opening, setOpening] = useState(false);
  const [toast, setToast] = useState("");
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const network = useSyncExternalStore(
    multiplayer.subscribe,
    multiplayer.snapshot,
  );
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLElement>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [fps, setFps] = useState(60);
  const low =
    settings.graphics === "LOW" ||
    (settings.graphics === "AUTO" &&
      ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ??
        8) <= 4);
  useEffect(() => {
    audio.apply(settings);
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystemReduced(q.matches);
    q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!root.current) return;
    const ro = new ResizeObserver(([e]) =>
      setDimensions({
        w: Math.round(e.contentRect.width),
        h: Math.round(e.contentRect.height),
      }),
    );
    ro.observe(root.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!settings.diagnostics) return;
    let raf = 0,
      frames = 0,
      last = performance.now();
    function tick(now: number) {
      frames++;
      if (now - last > 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settings.diagnostics]);
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const closeInspector = useCallback(() => setInspectId(null), []);
  const closeOdds = useCallback(() => setOdds(null), []);
  function navigate(p: Page) {
    audio.play("tap");
    if (p === "rip") {
      if (game.save?.pending) {
        setOpening(true);
        return;
      }
      setPage("rip");
      return;
    }
    setPage(p);
  }
  async function buy(set: SetDefinition, productId = "standard") {
    if (game.busy) return;
    if (game.save?.pending) {
      setOpening(true);
      return;
    }
    try {
      const result = await game.update((s) =>
        purchase(s, set, generateId(), Date.now(), Math.random, productId),
      );
      if (result.pending) {
        audio.play("coin");
        setOpening(true);
      }
    } catch {
      /* Game store displays the failure. */
    }
  }
  function inspectCard(id: string) {
    setInspectId(id);
    if (game.save?.owned.some((c) => c.instanceId === id))
      void game.update(inspect).catch(() => {});
  }
  async function prepareSale(id: string) {
    setRecycleId(id);
    setSellQuote(null);
    setSaleError("");
    setSaleLoading(true);
    const c = game.save?.owned.find((o) => o.instanceId === id);
    try {
      if (c) setSellQuote(await saleQuote(c.cardId, c.finish, c.ham));
    } catch (e) {
      setSaleError((e as Error).message);
    } finally {
      setSaleLoading(false);
    }
  }
  function changedSettings(s: Settings) {
    setSettings(s);
    audio.play("tap");
  }
  const ready =
    game.save && game.profile
      ? { ...game, save: game.save, profile: game.profile }
      : null;
  return (
    <MotionConfig
      reducedMotion={
        settings.reducedMotion || systemReduced ? "always" : "never"
      }
    >
      <div className="desktop-scene">
        <aside className="desktop-brand">
          <div className="brand-mark">
            <Sparkles size={27} />
          </div>
          <span className="eyebrow">WELCOME TO YOUR NEXT OBSESSION</span>
          <h1>
            A little foil.
            <br />A whole
            <br />
            <em>universe.</em>
          </h1>
          <p>
            Collect the moments
            <br />
            between the ordinary.
          </p>
          <div className="desktop-rule" />
          <small>PACK MINI / COLLECTOR SERIES 001</small>
        </aside>
        <div
          ref={root}
          className={`game-root ${low ? "quality-low" : "quality-high"} ${settings.reducedMotion || systemReduced ? "reduced-motion" : ""}`}
          onPointerDownCapture={() => audio.unlock()}
        >
          {!ready ? (
            <div className="loading-screen">
              <Sparkles size={36} />
              <h1>PACK MINI</h1>
              <p>{game.error || "Preparing your next discovery…"}</p>
              {game.error && (
                <button className="secondary" onClick={game.retry}>
                  TRY AGAIN
                </button>
              )}
              <span className="loading-line" />
            </div>
          ) : (
            <>
              <header className="app-header">
                <button
                  className="brand"
                  aria-label="PACK MINI home"
                  onClick={() => navigate("home")}
                >
                  <Sparkles size={19} />
                  <span>
                    PACK MINI<small>TINY PACKS · BIG FEELINGS</small>
                  </span>
                </button>
                <div className="header-actions">
                  <button
                    className="mini-radio"
                    aria-label="Offer notifications"
                    onClick={() => setOverlay("offers")}
                  >
                    <Bell size={12} />
                    {miniSocial.entries.filter(
                      (e) =>
                        e.kind === "offer" &&
                        e.target === game.profile?.playerId,
                    ).length || ""}
                  </button>
                  <RadioButton />
                  <div
                    className="coin-balance"
                    aria-label={`${game.save!.coins} coins`}
                  >
                    <Coins size={16} />
                    <b key={game.save!.coins}>
                      {game.save!.coins.toLocaleString()}
                    </b>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Settings"
                    onClick={() => setOverlay("settings")}
                  >
                    <SettingsIcon size={18} />
                  </button>
                </div>
              </header>
              <div className="profile-bar">
                <span>
                  <span className="level-badge">{level(game.save!.xp)}</span>{" "}
                  <span className="profile-name">
                    <Avatar profile={game.profile!} />
                    {game.profile!.nickName}
                  </span>{" "}
                  <b>LV. {level(game.save!.xp)}</b>
                  <Badges ids={earnedBadges(game.save!, allCards)} />
                </span>
                <div className="progress">
                  <i
                    style={{ width: `${levelProgress(game.save!.xp) * 100}%` }}
                  />
                </div>
                <button
                  className="profile-status"
                  onClick={() => setOverlay("chat")}
                >
                  <i
                    className={`status-dot ${network.status === "online" ? "online" : ""}`}
                  />
                  {network.status === "online"
                    ? `LIVE · ${Object.keys(network.peers).length + 1}`
                    : network.status === "retrying"
                      ? "RETRYING"
                      : "CONNECTING"}
                </button>
              </div>
              <main ref={scroll} className="page-scroll">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={page}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                  >
                    {page === "home" && (
                      <Home
                        game={ready}
                        onBuy={(s, p) => void buy(s, p)}
                        onMissions={() => setOverlay("missions")}
                        onEarn={() => setOverlay("arcade")}
                        onCards={() => navigate("cards")}
                      />
                    )}
                    {(page === "shop" || page === "rip") && (
                      <Shop
                        game={ready}
                        onBuy={(s, p) => void buy(s, p)}
                        onOdds={(set, productId) =>
                          setOdds({ set, productId: productId ?? "standard" })
                        }
                      />
                    )}
                    {page === "cards" && (
                      <Collection game={ready} onInspect={inspectCard} />
                    )}
                    {page === "social" && (
                      <Social game={ready} onInspect={inspectCard} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>
              <nav className="bottom-nav" aria-label="Main navigation">
                {(
                  [
                    { id: "home", label: "HOME", icon: HomeIcon },
                    { id: "shop", label: "SHOP", icon: ShoppingBag },
                    { id: "rip", label: "RIP", icon: PackageOpen },
                    { id: "cards", label: "CARDS", icon: Layers },
                    { id: "social", label: "SOCIAL", icon: Users },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-current={page === id ? "page" : undefined}
                    className={`${page === id ? "active" : ""} ${id === "rip" ? "rip-nav" : ""}`}
                    onClick={() => navigate(id)}
                  >
                    <span className="nav-icon">
                      <Icon size={id === "rip" ? 23 : 20} />
                    </span>
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
              {!opening && page !== "social" && !overlay && (
                <button
                  className="chat-shortcut"
                  onClick={() => setOverlay("chat")}
                >
                  CHAT · {Object.keys(network.peers).length + 1}
                </button>
              )}
              {trade.session &&
                !["completed", "cancelled"].includes(trade.session.status) &&
                overlay !== "trades" &&
                page !== "social" && (
                  <button
                    className="trade-toast"
                    onClick={() => setOverlay("trades")}
                  >
                    🎴 Live trade{" "}
                    {trade.session.status === "settling"
                      ? "· confirmation saved"
                      : "offer"}{" "}
                    — OPEN →
                  </button>
                )}
              {game.save!.pending && !opening && (
                <button
                  className="pending-pack"
                  onClick={() => setOpening(true)}
                >
                  <PackageOpen size={16} /> YOUR PACK IS WAITING{" "}
                  <ArrowRight size={15} />
                </button>
              )}
              {opening && game.save!.pending && (
                <Opening
                  key={game.save!.pending.id}
                  game={ready}
                  settings={{
                    ...settings,
                    reducedMotion: settings.reducedMotion || systemReduced,
                    graphics: low ? "LOW" : settings.graphics,
                  }}
                  onExit={(destination = "home") => {
                    setOpening(false);
                    setPage(destination);
                  }}
                  onInspect={inspectCard}
                />
              )}
              <AnimatePresence>
                {overlay && (
                  <Modal
                    key={overlay}
                    title={
                      overlay === "offers"
                        ? "Trade offers"
                        : overlay === "chat"
                          ? "Room chat"
                          : overlay === "trades"
                            ? "Live trade"
                            : overlay === "arcade"
                              ? "Earn Credits"
                              : overlay === "settings"
                                ? "Your preferences"
                                : overlay === "study"
                                  ? "Collector’s eye"
                                  : "Collector missions"
                    }
                    onClose={closeOverlay}
                  >
                    {overlay === "offers" ? (
                      <Social
                        game={ready}
                        onInspect={inspectCard}
                        initialTab="notifications"
                      />
                    ) : overlay === "chat" ? (
                      <Social game={ready} onInspect={inspectCard} />
                    ) : overlay === "trades" ? (
                      <Trades game={ready} />
                    ) : overlay === "arcade" ? (
                      <Arcade
                        game={ready}
                        onStudy={() => setOverlay("study")}
                      />
                    ) : overlay === "settings" ? (
                      <SettingsPanel
                        settings={settings}
                        onChange={changedSettings}
                        save={game.save!}
                        networkStatus={network.status}
                        onOpenProjectFiles={onOpenProjectFiles}
                      />
                    ) : overlay === "study" ? (
                      <Study
                        game={ready}
                        onDone={() => setOverlay("missions")}
                      />
                    ) : (
                      <MissionPanel
                        game={ready}
                        onStudy={() => setOverlay("study")}
                      />
                    )}
                  </Modal>
                )}
                {odds && (
                  <Modal key="odds" title="Inside the foil" onClose={closeOdds}>
                    <Odds set={odds.set} productId={odds.productId} />
                  </Modal>
                )}
                {inspectId && (
                  <Modal
                    key="inspector"
                    title="A closer look"
                    onClose={closeInspector}
                  >
                    <Inspector
                      id={inspectId}
                      game={ready}
                      onRecycle={(id) => void prepareSale(id)}
                    />
                  </Modal>
                )}
                {recycleId && (
                  <Modal
                    key="recycle"
                    title="Sell card"
                    onClose={() => setRecycleId(null)}
                  >
                    <div className="recycle-confirm">
                      <h2>Sell this card?</h2>
                      {saleLoading && <p>Checking market references…</p>}
                      {saleError && <p role="alert">{saleError}</p>}
                      {sellQuote && (
                        <>
                          <div className="sale-offer">
                            <span>
                              <small>
                                {hamMultiplier(sellQuote.ham) * 100}% of $
                                {sellQuote.marketUsd.toFixed(2)} USD
                              </small>
                              <br />
                              {sellQuote.source}
                            </span>
                            <b>{sellQuote.credits} credits</b>
                          </div>
                          <p className="fine-print">{sellQuote.reference}</p>
                        </>
                      )}
                      {badgesLost(game.save!, [recycleId], allCards).length >
                        0 && (
                        <p className="sell-warning" role="alert">
                          Selling your last required copy removes these gym
                          badges:{" "}
                          {badgesLost(game.save!, [recycleId], allCards).join(
                            ", ",
                          )}
                          .
                        </p>
                      )}
                      <button
                        className="primary full"
                        disabled={
                          game.busy || !sellQuote || sellQuote.credits < 1
                        }
                        onClick={() => {
                          if (sellQuote)
                            void game
                              .update((s) => sellCard(s, recycleId, sellQuote))
                              .then(() => {
                                setRecycleId(null);
                                setInspectId(null);
                                setToast("Sold! Credits added.");
                                audio.play("coin");
                              })
                              .catch(() => {});
                        }}
                      >
                        CONFIRM SELL · {sellQuote?.credits ?? "…"} CREDITS
                      </button>
                      <button
                        className="secondary full"
                        onClick={() => setRecycleId(null)}
                      >
                        KEEP MY CARD
                      </button>
                    </div>
                  </Modal>
                )}
              </AnimatePresence>
              {game.error && (
                <div className="error-toast" role="alert">
                  <span>{game.error}</span>
                  <button
                    className="icon-button"
                    aria-label="Dismiss error"
                    onClick={() => game.setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {toast && (
                <div className="toast" role="status">
                  <Check size={16} />
                  {toast}
                </div>
              )}
              {settings.diagnostics && (
                <div className="diagnostics">
                  {fps} FPS · {(1000 / fps).toFixed(1)}ms · {dimensions.w}×
                  {dimensions.h}
                  <br />
                  {network.status} · {low ? "LOW" : "HIGH"} · CSS CARD
                  <br />
                  particles ≤{opening && !low ? 22 : 0} · images{" "}
                  {document.images.length}
                </div>
              )}
            </>
          )}
        </div>
        <aside className="desktop-detail">
          <span className="edition-number">001</span>
          <span className="eyebrow">A COLLECTOR’S UNIVERSE</span>
          <h2>
            Nine eras.
            <br />
            Endless possibilities.
          </h2>
          <div className="detail-row">
            <span>CATALOGUE</span>
            <b>{totalCards.toLocaleString()} cards</b>
          </div>
          <div className="detail-row">
            <span>YOUR FIRST PACK</span>
            <b>Starts here ↙</b>
          </div>
          <div className="detail-row">
            <span>THE FEELING</span>
            <b>Unforgettable.</b>
          </div>
          <span className="desktop-footnote">
            PROTOTYPE COLLECTION
            <br />
            REAL CARDS. NEW POSSIBILITIES.
          </span>
        </aside>
      </div>
    </MotionConfig>
  );
}
