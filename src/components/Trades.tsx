import { useEffect, useState, useSyncExternalStore } from "react";
import type { Game } from "../services/useGame";
import { trading } from "../services/trading";
import { multiplayer } from "../services/multiplayer";
import { cardById } from "../game/catalogue";
import { lockedTradeIds } from "../game/trading";
import { CardView } from "./CardView";
import "../styles/social-update.css";
export function Trades({ game }: { game: Game }) {
  const {
    session: t,
    error,
    busy,
  } = useSyncExternalStore(trading.subscribe, trading.snapshot);
  const network = useSyncExternalStore(
    multiplayer.subscribe,
    multiplayer.snapshot,
  );
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!t?.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [t?.id, t?.expiresAt]);
  const me = game.profile!.playerId,
    save = game.save!;
  const peers = Object.values(network.peers).filter(
    (c) => c.profile.playerId !== me,
  );
  const other = t?.parties.find((p) => p !== me);
  const locked = lockedTradeIds(save);
  const pending = new Set([
    ...(save.pending?.instances ?? []),
    ...save.queued.flatMap((p) => p.instances),
  ]);
  const available = save.owned.filter(
    (c) =>
      !pending.has(c.instanceId) &&
      (!locked.has(c.instanceId) ||
        t?.offers[me]?.some((o) => o.instanceId === c.instanceId)),
  );
  const [query, setQuery] = useState("");
  function act(fn: () => void | Promise<void>) {
    setNotice("");
    try {
      void Promise.resolve(fn()).catch((e) => setNotice(e.message));
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <div className="trades-panel">
      <p className="fine-print">
        Submit an offer to authorize those exact cards. The accepting collector
        confirms once; both game clients check and complete the swap.
      </p>
      {(!t || ["cancelled", "completed"].includes(t.status)) && (
        <>
          {t?.status === "completed" && (
            <p className="success-notice" role="status">
              Trade complete — your new cards are in your binder.
            </p>
          )}
          {t?.status === "cancelled" && (
            <p className="notice">Trade declined. Your cards are yours.</p>
          )}
          {save.trades?.some((j) => j.status === "ready") && (
            <p className="notice">
              A previous swap is recovering in the background. Its exact cards
              stay reserved; your other cards are available.
            </p>
          )}
          <h3>Online collectors</h3>
          {peers.map((c) => (
            <button
              className="collector-row"
              key={c.profile.playerId}
              onClick={() => act(() => trading.invite(c.profile.playerId))}
            >
              <span>
                <b>{c.profile.nickName}</b>
                <small>
                  {c.cards} cards · LV. {c.level}
                </small>
              </span>
              <b>OFFER TRADE →</b>
            </button>
          ))}
          {!peers.length && <p>Waiting for another collector to connect…</p>}
        </>
      )}
      {t && !["cancelled", "completed"].includes(t.status) && (
        <>
          <h3>
            Trading with{" "}
            {peers.find((c) => c.profile.playerId === other)?.profile
              .nickName ?? "collector"}
          </h3>
          {t.expiresAt && (
            <p className="fine-print">
              {Math.max(0, Math.ceil((t.expiresAt - now) / 1000))}s remaining ·
              this trade closes automatically
            </p>
          )}
          <div className="trade-offers">
            {[me, other!].map((p) => (
              <section key={p}>
                <h4>
                  {p === me ? "YOU OFFER" : "THEY OFFER"}{" "}
                  {t.ready.includes(p) ? "✓ CONFIRMED" : ""}
                </h4>
                <div className="trade-card-row">
                  {t.offers[p]?.map((c) => (
                    <div key={c.instanceId}>
                      <CardView
                        card={cardById.get(c.cardId)}
                        finish={c.finish}
                        ham={c.ham}
                      />
                      <small>{cardById.get(c.cardId)?.name}</small>
                      <small>
                        {c.finish} · {c.ham ? `HAM ${c.ham}` : "UNGRADED"}
                      </small>
                    </div>
                  ))}
                </div>
                {!t.offers[p]?.length && <small>Choosing cards…</small>}
              </section>
            ))}
          </div>
          {t.status === "draft" && !t.ready.length && !t.protocol && (
            <>
              <label className="search">
                <input
                  aria-label="Search trade cards"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Choose up to 3 cards…"
                />
              </label>
              <div className="trade-picker">
                {available
                  .filter((c) =>
                    cardById
                      .get(c.cardId)
                      ?.name.toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .slice(0, 80)
                  .map((c) => {
                    const picked = t.offers[me]?.some(
                      (o) => o.instanceId === c.instanceId,
                    );
                    return (
                      <button
                        key={c.instanceId}
                        aria-label={`Offer ${cardById.get(c.cardId)?.name} ${c.instanceId}`}
                        aria-pressed={picked}
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            trading.offer(
                              picked
                                ? t.offers[me]
                                    .filter(
                                      (o) => o.instanceId !== c.instanceId,
                                    )
                                    .map((o) => o.instanceId)
                                : [
                                    ...(t.offers[me] ?? []).map(
                                      (o) => o.instanceId,
                                    ),
                                    c.instanceId,
                                  ],
                            ),
                          )
                        }
                      >
                        <CardView
                          card={cardById.get(c.cardId)}
                          finish={c.finish}
                          ham={c.ham}
                        />
                        <small>
                          {picked ? "✓ " : ""}
                          {cardById.get(c.cardId)?.name}
                        </small>
                      </button>
                    );
                  })}
              </div>
              {!available.length && (
                <p>
                  Finish opening a pack to make its cards available for trading.
                </p>
              )}
            </>
          )}
          {["draft", "unsubmitted"].includes(t.status) && (
            <button
              className="primary full"
              disabled={
                busy ||
                !t.offers[me]?.length ||
                !t.offers[other!]?.length ||
                network.status !== "online"
              }
              onClick={() => act(() => trading.confirm())}
            >
              {t.status === "unsubmitted"
                ? "RETRY SENDING CONFIRMATION"
                : "CONFIRM THESE CARDS"}
            </button>
          )}
          {t.status === "settling" && (
            <p className="success-notice" role="status">
              {!!t.protocol
                ? "Checking the offering device and exchanging the exact cards automatically…"
                : t.ready.includes(me)
                  ? "Your confirmation was sent. Waiting for the other collector; recovery continues automatically."
                  : "Saving your confirmation… your cards have not been exchanged."}
            </p>
          )}
          {t.status === "unsubmitted" && (
            <p className="notice">
              This saved trade was never delivered. Retry sending it, or cancel
              to release these cards and trade with someone else.
            </p>
          )}
          {(!!t.protocol ||
            !t.ready.includes(me) ||
            t.status === "unsubmitted") && (
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => act(() => trading.decline())}
            >
              {!!t.protocol
                ? "CANCEL / CLOSE TRADE"
                : t.status === "unsubmitted"
                  ? "CANCEL UNSENT TRADE"
                  : "CANCEL / CLOSE TRADE"}
            </button>
          )}
          {t.status === "settling" && (
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => act(() => trading.recover())}
            >
              RETRY TRADE RECOVERY
            </button>
          )}
        </>
      )}
      {(notice || error) && (
        <p className="inline-error" role="alert">
          {notice || error}
        </p>
      )}
    </div>
  );
}
