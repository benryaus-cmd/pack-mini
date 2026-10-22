import { useState, useSyncExternalStore } from "react";
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
        Live card swaps · both collectors confirm the same offers.
        Client-trusted trades settle on each device; keep your collection on
        this device.
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
          {t.status === "draft" && !t.ready.length && (
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
          {t.status === "draft" && (
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
              CONFIRM THESE CARDS
            </button>
          )}
          {t.status === "settling" && (
            <p className="success-notice" role="status">
              Your confirmation is saved. Waiting for the other collector;
              recovery continues automatically.
            </p>
          )}
          {!t.ready.includes(me) && (
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => act(() => trading.decline())}
            >
              DECLINE TRADE
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
