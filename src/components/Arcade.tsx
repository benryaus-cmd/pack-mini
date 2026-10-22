import { useEffect, useRef, useState, type CSSProperties } from "react";
import { generateId } from "../game/uuid";
import { Coins, Eye, Sparkles } from "lucide-react";
import type { Game } from "../services/useGame";
import {
  ARCADE_STAKE,
  arcadeResult,
  playArcade,
  startDrop,
  settleDrop,
  type ArcadeKind,
  type ArcadeResult,
  type PendingDrop,
} from "../game/arcade";
import {
  createDrop,
  stepDrop,
  disposeDrop,
  PEGS,
  DROP_PAYOUTS,
  DROP_STEP,
  type DropSimulation,
} from "../game/plinko";
import { audio } from "../services/audio";
import "../styles/arcade.css";
const symbols = ["✦", "◈", "●"];
export function Arcade({ game, onStudy }: { game: Game; onStudy: () => void }) {
  const [kind, setKind] = useState<ArcadeKind>("slots");
  const [result, setResult] = useState<ArcadeResult>();
  const [spinning, setSpinning] = useState(false);
  const [spin, setSpin] = useState(0);
  const [error, setError] = useState("");
  const [balls, setBalls] = useState<{ id: string; x: number; y: number }[]>(
    [],
  );
  const [launching, setLaunching] = useState(false);
  const latest = useRef(game);
  latest.current = game;
  const lock = useRef(false);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const simulations = useRef(new Map<string, DropSimulation>());
  const settling = useRef(new Set<string>());
  const retryAt = useRef(new Map<string, number>());
  const pending =
    (game.save as typeof game.save & { pendingDrops?: PendingDrop[] })
      ?.pendingDrops ?? [];
  useEffect(() => {
    for (const ball of pending) {
      if (!simulations.current.has(ball.id))
        simulations.current.set(ball.id, createDrop(ball.seed));
    }
  }, [game.save]);
  useEffect(() => {
    active.current = true;
    let frame = 0,
      previous = performance.now(),
      accumulator = 0,
      lastPaint = 0,
      hadBalls = false;
    function tick(now: number) {
      accumulator += Math.min(100, now - previous);
      previous = now;
      let steps = 0;
      while (accumulator >= DROP_STEP && steps++ < 12) {
        for (const sim of simulations.current.values()) stepDrop(sim);
        accumulator -= DROP_STEP;
      }
      for (const [id, sim] of simulations.current) {
        if (
          sim.bin === null ||
          settling.current.has(id) ||
          (retryAt.current.get(id) ?? 0) > now
        )
          continue;
        settling.current.add(id);
        void latest.current
          .update((save) => settleDrop(save, id))
          .then((saved) => {
            disposeDrop(sim);
            simulations.current.delete(id);
            retryAt.current.delete(id);
            if (active.current) {
              setResult(arcadeResult(saved, id));
              audio.play("coin");
            }
          })
          .catch((e) => {
            retryAt.current.set(id, performance.now() + 2000);
            if (active.current) setError((e as Error).message);
          })
          .finally(() => settling.current.delete(id));
      }
      if (now - lastPaint > 30 && (simulations.current.size > 0 || hadBalls)) {
        setBalls(
          Array.from(simulations.current, ([id, sim]) => ({
            id,
            x: sim.ball.position.x,
            y: sim.ball.position.y,
          })),
        );
        hadBalls = simulations.current.size > 0;
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      active.current = false;
      cancelAnimationFrame(frame);
      clearTimeout(timer.current);
      for (const sim of simulations.current.values()) disposeDrop(sim);
      simulations.current.clear();
    };
  }, []);
  async function play(count = 1) {
    if (lock.current || game.busy || spinning) return;
    lock.current = true;
    setError("");
    if (kind === "drop") {
      setLaunching(true);
      try {
        for (let i = 0; i < count; i++)
          await game.update((save) => startDrop(save, generateId()));
      } catch (e) {
        if (active.current) setError((e as Error).message);
      } finally {
        lock.current = false;
        if (active.current) setLaunching(false);
      }
      return;
    }
    setSpinning(true);
    setResult(undefined);
    try {
      const id = generateId();
      const saved = await game.update((save) => playArcade(save, "slots", id));
      if (!active.current) return;
      setResult(arcadeResult(saved, id));
      setSpin((value) => value + 1);
      timer.current = setTimeout(() => {
        lock.current = false;
        if (active.current) {
          setSpinning(false);
          audio.play("coin");
        }
      }, 1900);
    } catch (e) {
      lock.current = false;
      if (active.current) {
        setSpinning(false);
        setError((e as Error).message);
      }
    }
  }
  const displayed = !spinning && result?.kind === kind ? result : undefined;
  return (
    <div className="arcade-panel">
      <span className="eyebrow">THE COLLECTOR’S ARCADE</span>
      <h2>A little luck. A sharper eye.</h2>
      <p>
        Play for credits. Virtual credits only, with no cash value or cash
        prizes.
      </p>
      <button className="arcade-study" onClick={onStudy}>
        <Eye size={24} />
        <span>
          <b>Collector’s Eye</b>
          <small>Six pairs · four lives · free to play</small>
        </span>
        <strong>
          +250 <Coins size={14} />
        </strong>
      </button>
      <div className="arcade-tabs" role="tablist" aria-label="Credit games">
        {(["slots", "drop"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={kind === tab}
            disabled={spinning}
            onClick={() => {
              setKind(tab);
              setError("");
            }}
          >
            {tab === "slots" ? "LUCKY REELS" : "COIN DROP"}
          </button>
        ))}
      </div>
      <div className="arcade-machine">
        {kind === "slots" ? (
          <div
            className="arcade-reels"
            aria-label={
              displayed
                ? `Reels: ${displayed.values.map((v) => symbols[v]).join(" ")}`
                : spinning
                  ? "Three reels spinning"
                  : "Three reels ready"
            }
          >
            {[0, 1, 2].map((i) => (
              <div className="arcade-reel" key={i}>
                <div
                  key={spin}
                  className={`arcade-strip ${spinning && result ? "is-spinning" : ""}`}
                  style={
                    { "--stop-time": `${1100 + i * 350}ms` } as CSSProperties
                  }
                >
                  {Array.from({ length: 25 }, (_, index) => (
                    <span key={index}>
                      {
                        symbols[
                          index === 24
                            ? result?.kind === "slots"
                              ? result.values[i]
                              : i
                            : (index + i) % 3
                        ]
                      }
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="arcade-drop">
            <svg
              viewBox="0 0 300 310"
              role="img"
              aria-label={`Physics ball drop board. ${pending.length} of five balls in play.`}
            >
              <rect
                x="4"
                y="3"
                width="292"
                height="304"
                rx="8"
                className="arcade-board"
              />
              {PEGS.map((peg, i) => (
                <circle
                  key={i}
                  cx={peg.x}
                  cy={peg.y}
                  r="3.7"
                  className="arcade-peg"
                />
              ))}
              {[60, 120, 180, 240].map((x) => (
                <path key={x} d={`M${x} 265 V309`} className="arcade-divider" />
              ))}
              {balls.map((ball) => (
                <circle
                  key={ball.id}
                  cx={ball.x}
                  cy={ball.y}
                  r="6"
                  className="arcade-ball"
                />
              ))}
            </svg>
            <div className="arcade-bins">
              {DROP_PAYOUTS.map((payout, i) => (
                <span
                  key={i}
                  className={displayed?.values[0] === i ? "landed" : ""}
                >
                  {payout}
                </span>
              ))}
            </div>
            <p className="arcade-live">
              {pending.length} / 5 balls in play · saved balls resume here after
              reload
            </p>
          </div>
        )}
        <div className="arcade-result" role="status" aria-live="polite">
          {displayed ? (
            <>
              PAYOUT <b>{displayed.payout} CREDITS</b>
              <small>
                {displayed.payout >= ARCADE_STAKE ? "+" : ""}
                {displayed.payout - ARCADE_STAKE} after your {ARCADE_STAKE}
                -credit play
              </small>
            </>
          ) : (
            <>
              <Sparkles size={18} />
              <span>
                {spinning
                  ? "Reels spinning…"
                  : `Every play costs ${ARCADE_STAKE} credits`}
              </span>
            </>
          )}
        </div>
        {kind === "slots" ? (
          <button
            className="primary full"
            disabled={spinning || game.busy || game.save!.coins < ARCADE_STAKE}
            onClick={() => void play()}
          >
            {spinning ? "SPINNING…" : "SPIN"} <Coins size={15} /> {ARCADE_STAKE}
          </button>
        ) : (
          <div
            className="arcade-launches"
            aria-label="Choose number of balls to drop"
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <button
                key={count}
                disabled={
                  launching ||
                  game.busy ||
                  pending.length + count > 5 ||
                  game.save!.coins < ARCADE_STAKE * count
                }
                onClick={() => void play(count)}
              >
                <b>
                  {count} {count === 1 ? "BALL" : "BALLS"}
                </b>
                <small>{count * ARCADE_STAKE} credits</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <details className="arcade-odds">
        <summary>How it works & payouts</summary>
        {kind === "slots" ? (
          <p>
            Three independent reels, each with three equally likely symbols.
            Three matching: 150 credits (3/27). Exactly one pair: 60 credits
            (18/27). All different: 0 (6/27). Average payout: 56.67 credits per
            50-credit play.
          </p>
        ) : (
          <p>
            Real gravity, bouncing pegs, walls and five physical bins decide
            each ball’s landing. Bins pay 120, 80, 0, 80, 120 credits from left
            to right. Bin probabilities depend on the physical trajectory; they
            are not equal. Up to five balls can run at once.
          </p>
        )}
        <p>
          Payout includes your stake. Reels save their result before the reveal.
          Every drop saves its charge and launch seed before release; reopening
          this arcade replays unfinished balls and settles each once.
          Collector’s Eye is always free.
        </p>
      </details>
    </div>
  );
}
