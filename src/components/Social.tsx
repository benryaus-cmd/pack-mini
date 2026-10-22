import { livePosts, reactions } from "../game/social";
import { lockedTradeIds } from "../game/trading";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SmilePlus, Bell, ChevronRight, Link, Send, X } from "lucide-react";
import type { Game } from "../services/useGame";
import type { Collector } from "../services/protocol";
import { multiplayer } from "../services/multiplayer";
import { social, type SocialEntry, type SocialCard } from "../services/social";
import { cardById } from "../game/catalogue";
import { level } from "../game/engine";
import { earnedBadges } from "../game/binders";
import { allCards } from "../game/catalogue";
import { CardView } from "./CardView";
import { Badges } from "./Pages";
import { Trades } from "./Trades";
import { trading } from "../services/trading";
import "../styles/mini-social.css";
export function Social({
  game,
  onInspect,
  initialTab = "lounge",
}: {
  game: Game;
  initialTab?: string;
  onInspect: (id: string, preview?: SocialCard) => void;
}) {
  const network = useSyncExternalStore(
      multiplayer.subscribe,
      multiplayer.snapshot,
    ),
    state = useSyncExternalStore(social.subscribe, social.snapshot);
  const profile = game.profile!,
    save = game.save!,
    me = profile.playerId,
    online = network.status === "online",
    peers = Object.values(network.peers);
  const [tab, setTab] = useState(initialTab),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [host, setHost] = useState(multiplayer.host),
    [room, setRoom] = useState(network.room),
    [selected, setSelected] = useState<Collector | null>(null),
    [leaders, setLeaders] = useState<any[]>([]),
    [period, setPeriod] = useState<"daily" | "all-time">("daily"),
    [picker, setPicker] = useState<{
      post?: SocialEntry;
      target?: string;
    } | null>(null),
    [choice, setChoice] = useState<string[]>([]),
    [reacting, setReacting] = useState<string | null>(null),
    [confirmPost, setConfirmPost] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const chatContent = useRef<HTMLDivElement>(null);
  const followingLatest = useRef(true);
  const badgeIds = earnedBadges(save, allCards);
  const posts = livePosts(state.entries),
    offers = state.entries.filter(
      (e) =>
        e.kind === "offer" &&
        posts.some((p) => p.id === e.parent && p.mode !== "showcase"),
    );
  const incoming = offers.filter((e) => e.target === me && e.player !== me);
  useLayoutEffect(() => {
    if (tab === "lounge" && log.current) {
      followingLatest.current = true;
      log.current.scrollTop = log.current.scrollHeight;
    }
  }, [tab, network.messages, state.entries]);
  useLayoutEffect(() => {
    if (tab !== "lounge" || !chatContent.current) return;
    // Fonts and card images can change message heights after the first layout.
    const observer = new ResizeObserver(() => {
      if (followingLatest.current && log.current)
        log.current.scrollTop = log.current.scrollHeight;
    });
    observer.observe(chatContent.current);
    return () => observer.disconnect();
  }, [tab]);
  const current = (id: string) =>
    id === me
      ? { profile, badges: badgeIds }
      : peers.find((c) => c.profile.playerId === id);
  const name = (id: string, fallback = "Collector") =>
    current(id)?.profile.nickName ?? fallback;
  const isHere = (id: string) =>
    id === me ? online : online && peers.some((c) => c.profile.playerId === id);
  async function act(fn: () => unknown | Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function cardsFor(e: SocialEntry) {
    return (
      <span className="ms-offered-cards">
        {e.cards?.map((c) => (
          <button
            key={c.instanceId}
            title={`Inspect ${cardById.get(c.cardId)?.name}`}
            onClick={() =>
              onInspect(
                save.owned.some((o) => o.instanceId === c.instanceId)
                  ? c.instanceId
                  : c.cardId,
                c,
              )
            }
          >
            <CardView
              card={cardById.get(c.cardId)}
              finish={c.finish}
              ham={c.ham}
            />
            <small className="ms-card-grade">
              {c.ham ? `HAM ${c.ham}` : "UNGRADED"}
            </small>
            <small>{cardById.get(c.cardId)?.name}</small>
          </button>
        ))}
      </span>
    );
  }
  function openPicker(post?: SocialEntry, target?: string) {
    setChoice([]);
    setConfirmPost(false);
    setPicker({ post, target });
  }
  function acceptOffer(e: SocialEntry) {
    const post = posts.find((p) => p.id === e.parent);
    if (!post || post.mode === "showcase")
      throw Error("Original trade listing is withdrawn or unavailable.");
    if (!isHere(e.player)) throw Error("Both collectors must be online.");
    const prior = [
      post,
      ...offers.filter((o) => o.parent === post.id && o.at < e.at),
    ]
      .filter((o) => o.player === me)
      .at(-1);
    if (!prior) throw Error("Add your cards with a counteroffer first.");
    trading.invite(
      e.player,
      prior.cards?.map((c) => c.instanceId) ?? [],
      e.cards?.map((c) => c.instanceId) ?? [],
    );
    setTab("exchange");
  }
  function offerRow(e: SocialEntry) {
    return (
      <div className="ms-response" key={e.id}>
        <div className="ms-response-head">
          <b>{name(e.player)}</b>
          <span>→ {name(e.target ?? "")}</span>
          <i className={isHere(e.player) ? "ms-online" : ""} />
        </div>
        {cardsFor(e)}
        <div className="ms-response-actions">
          {e.target === me && (
            <button
              disabled={!isHere(e.player) || busy}
              onClick={() => void act(() => acceptOffer(e))}
            >
              Review & accept
            </button>
          )}
          {e.player !== me && (
            <button
              disabled={!isHere(e.player)}
              onClick={() => openPicker(e, e.player)}
            >
              Counteroffer
            </button>
          )}
        </div>
      </div>
    );
  }
  async function submitCards(mode: "showcase" | "trade") {
    await act(() => {
      const cards: SocialCard[] = choice.map((id) => {
        const c = save.owned.find((c) => c.instanceId === id);
        if (!c)
          throw Error("A selected copy is no longer owned. Select again.");
        if (
          mode === "trade" &&
          (lockedTradeIds(save).has(id) ||
            save.pending?.instances.includes(id) ||
            save.queued.some((p) => p.instances.includes(id)))
        )
          throw Error(
            "Finish this pack or confirmed trade before listing these copies.",
          );
        return {
          instanceId: c.instanceId,
          cardId: c.cardId,
          finish: c.finish,
          ham: c.ham,
        };
      });
      if (picker?.post) social.offer(picker.post, cards, picker.target);
      else social.post(cards, mode);
      setPicker(null);
      setConfirmPost(false);
    });
  }
  const timeline = [
    ...network.messages.map((m) => ({
      type: "chat" as const,
      at: m.at,
      id: m.id,
      m,
    })),
    ...posts.map((p) => ({ type: "post" as const, at: p.at, id: p.id, p })),
  ].sort((a, b) => a.at - b.at);
  return (
    <div className="page social-page mini-social">
      <div className="ms-status">
        <span>
          <i className={online ? "ms-online" : ""} />
          {online
            ? `${Math.max(network.population, peers.length + 1)} online`
            : network.status === "retrying"
              ? "Reconnecting…"
              : network.status === "connecting"
                ? "Connecting…"
                : "Offline"}{" "}
          <small>· {network.room}</small>
        </span>
        <button
          aria-label="Server and room"
          onClick={() => setEditing((v) => !v)}
        >
          <Link size={13} />
        </button>
      </div>
      {editing && (
        <form
          className="ms-server"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => {
              const u = new URL(host);
              if (
                u.protocol !== "https:" &&
                !(
                  u.protocol === "http:" &&
                  ["localhost", "127.0.0.1"].includes(u.hostname)
                )
              )
                throw Error("Use an HTTPS server.");
              if (!/^[\w-]{1,32}$/.test(room))
                throw Error(
                  "Use 1–32 letters, numbers or dashes for the room.",
                );
              localStorage.setItem("packmini-host", u.origin);
              multiplayer.connect(u.origin, room);
              setEditing(false);
            });
          }}
        >
          <input
            aria-label="Multiplayer server"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
          <input
            aria-label="Multiplayer room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />
          <button>Connect</button>
        </form>
      )}
      <div className="tabs social-tabs">
        {[
          ["lounge", "Chat"],
          [
            "notifications",
            `Offers${incoming.length ? " · " + incoming.length : ""}`,
          ],
          ["collectors", "People"],
          ["ranks", "Ranks"],
          ["exchange", "Trade"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={id === tab ? "active" : ""}
            onClick={() => {
              setTab(id);
              if (id === "ranks")
                void act(async () =>
                  setLeaders(
                    (await multiplayer.leaderboard(period)).players ?? [],
                  ),
                );
            }}
          >
            {id === "notifications" && <Bell size={12} />} {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {tab === "lounge" && (
        <>
          <div
            className="chat-log ms-chat"
            ref={log}
            onScroll={() => {
              const e = log.current;
              if (e)
                followingLatest.current =
                  e.scrollHeight - e.scrollTop - e.clientHeight < 24;
            }}
            aria-live="polite"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              void act(() => {
                const raw =
                  e.dataTransfer.getData("application/x-packmini-card") ||
                  e.dataTransfer.getData("application/x-pack-card") ||
                  e.dataTransfer.getData("text/plain");
                let id = raw;
                try {
                  id = JSON.parse(raw).instanceId ?? raw;
                } catch {}
                const card = save.owned.find((c) => c.instanceId === id);
                if (!card) throw Error("Drop a card from your collection.");
                social.post(
                  [
                    {
                      instanceId: card.instanceId,
                      cardId: card.cardId,
                      finish: card.finish,
                      ham: card.ham,
                    },
                  ],
                  "showcase",
                );
              });
            }}
          >
            <div ref={chatContent}>
              {!timeline.length && (
                <p className="chat-empty">
                  {online
                    ? "Say hello ♡ Show off a card or offer a trade."
                    : "Your room is reconnecting…"}
                </p>
              )}
              {timeline.map((item) => {
                const player =
                    item.type === "chat" ? item.m.playerId : item.p.player,
                  who = current(player),
                  fallback =
                    item.type === "chat"
                      ? item.m.name
                      : (item.p.name ?? "Collector");
                return (
                  <div
                    className={`chat-message ${player === me ? "own" : ""}`}
                    key={item.id}
                  >
                    <Avatar
                      profile={
                        who?.profile ?? {
                          nickName: fallback,
                          avatar:
                            item.type === "chat"
                              ? (item.m.avatar ?? "")
                              : (item.p.avatar ?? ""),
                        }
                      }
                    />
                    <div className="ms-message-body">
                      <strong>
                        {name(player, fallback)}
                        <Badges
                          ids={
                            who?.badges ??
                            network.badgesByPlayer?.[player] ??
                            []
                          }
                        />
                        <time>
                          {new Date(item.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </strong>
                      <div className="ms-text-line">
                        <button
                          className="ms-react-add"
                          aria-label="React to message"
                          aria-expanded={reacting === item.id}
                          onClick={() =>
                            setReacting(reacting === item.id ? null : item.id)
                          }
                        >
                          <SmilePlus size={14} />
                        </button>
                        {item.type === "chat" ? (
                          <p>{item.m.text}</p>
                        ) : (
                          <>
                            <span className="ms-trade-label">
                              {item.p.mode === "showcase"
                                ? "Showing off"
                                : item.p.cards?.length === 1
                                  ? "Single-card trade"
                                  : `Trade bundle · ${item.p.cards?.length} cards together`}{" "}
                              · {isHere(player) ? "online" : "offline"}
                            </span>
                            {cardsFor(item.p)}
                            {item.p.mode !== "showcase" && player !== me && (
                              <button
                                className="ms-offer-button"
                                disabled={!isHere(player)}
                                onClick={() => openPicker(item.p, player)}
                              >
                                Offer cards
                              </button>
                            )}
                            {player === me && item.p.mode !== "showcase" && (
                              <button
                                className="ms-withdraw"
                                disabled={!online || busy}
                                onClick={() =>
                                  void act(() => social.withdraw(item.p))
                                }
                              >
                                Remove trade listing
                              </button>
                            )}
                            <div className="ms-thread">
                              {offers
                                .filter((o) => o.parent === item.p.id)
                                .slice(-8)
                                .map(offerRow)}
                            </div>
                          </>
                        )}
                      </div>
                      <span className="ms-reactions">
                        {reactions.map((r) => {
                          const votes = state.entries.filter(
                            (e) =>
                              e.kind === "reaction" &&
                              e.message === item.id &&
                              e.reaction === r.id &&
                              e.active,
                          );
                          const mine = votes.some((e) => e.player === me);
                          if (!votes.length && reacting !== item.id)
                            return null;
                          return (
                            <button
                              key={r.id}
                              aria-label={`${r.label} reaction`}
                              aria-pressed={mine}
                              className={mine ? "active" : ""}
                              disabled={!online || busy}
                              onClick={() =>
                                void act(() => {
                                  social.react(item.id, r.id, !mine);
                                  setReacting(null);
                                })
                              }
                            >
                              {r.emoji}
                              {votes.length > 0 && (
                                <small>{votes.length}</small>
                              )}
                            </button>
                          );
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await multiplayer.chat(text);
                setText("");
              });
            }}
          >
            <button
              type="button"
              className="icon-button ms-card-add"
              aria-label="Show off or trade a card"
              disabled={!online || !save.owned.length}
              onClick={() => openPicker()}
            >
              ＋
            </button>
            <input
              aria-label="Chat message"
              placeholder="Say hello or drop a card…"
              maxLength={280}
              value={text}
              disabled={!online}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label="Send message"
              disabled={!online || !text.trim() || busy}
            >
              <Send size={17} />
            </button>
          </form>
          {network.feed.length > 0 && (
            <div className="ms-pulls">
              {network.feed.map((f) => (
                <button
                  key={f.id}
                  onClick={() =>
                    onInspect(f.cardId, {
                      instanceId: f.id,
                      cardId: f.cardId,
                      finish: f.finish ?? "gloss",
                      ham: f.ham,
                    })
                  }
                >
                  <CardView
                    card={cardById.get(f.cardId)}
                    finish={f.finish ?? "matte"}
                    ham={f.ham}
                  />
                  <span>
                    <b>
                      {f.name}
                      <Badges
                        ids={
                          peers.find((p) => p.profile.nickName === f.name)
                            ?.badges ?? []
                        }
                      />
                    </b>
                    <small>{cardById.get(f.cardId)?.name}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {tab === "notifications" && (
        <div className="ms-notifications">
          {incoming.length ? (
            incoming
              .slice()
              .reverse()
              .map((e) => (
                <div className="ms-notification" key={e.id}>
                  {offerRow(e)}
                  <small>
                    Accept opens a trade for both collectors to confirm.
                  </small>
                </div>
              ))
          ) : (
            <p className="chat-empty">No incoming offers yet ♡</p>
          )}
        </div>
      )}
      {tab === "collectors" && (
        <>
          <button
            className="collector-row"
            onClick={() =>
              setSelected({
                profile,
                level: level(save.xp),
                cards: save.owned.length,
                unique: new Set(save.owned.map((c) => c.cardId)).size,
                showcase: save.showcase
                  .map(
                    (id) => save.owned.find((c) => c.instanceId === id)?.cardId,
                  )
                  .filter((s): s is string => !!s),
                showcaseCards: save.showcase.flatMap((id) => {
                  const c = save.owned.find((c) => c.instanceId === id);
                  return c
                    ? [{ cardId: c.cardId, finish: c.finish, ham: c.ham }]
                    : [];
                }),
                badges: badgeIds,
              })
            }
          >
            <Avatar profile={profile} />
            <span>
              <b>
                {profile.nickName} <Badges ids={badgeIds} />
              </b>
              <small>You · LV. {level(save.xp)}</small>
            </span>
          </button>
          {peers.map((c) => (
            <button
              className="collector-row"
              key={c.profile.playerId}
              onClick={() => setSelected(c)}
            >
              <Avatar profile={c.profile} />
              <span>
                <b>
                  {c.profile.nickName} <Badges ids={c.badges} />
                </b>
                <small>
                  LV. {c.level} · {c.cards} cards
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!peers.length && (
            <p className="chat-empty">No other collectors here yet.</p>
          )}
          <button
            className="secondary full"
            disabled={!online || busy}
            onClick={() => void act(() => multiplayer.publish())}
          >
            Publish showcase & score
          </button>
        </>
      )}
      {tab === "ranks" && (
        <>
          <div className="ranking-period">
            {(["daily", "all-time"] as const).map((p) => (
              <button
                key={p}
                className={period === p ? "active" : ""}
                onClick={() => {
                  setPeriod(p);
                  void act(async () =>
                    setLeaders(
                      (await multiplayer.leaderboard(p)).players ?? [],
                    ),
                  );
                }}
              >
                {p === "daily" ? "Daily" : "All time"}
              </button>
            ))}
          </div>
          {leaders.map((p, i) => (
            <div className="leader-row" key={p.playerId}>
              <span>{p.rank ?? i + 1}</span>
              <b>{name(p.playerId, p.name)}</b>
              <strong>{p.score}</strong>
            </div>
          ))}
          {!leaders.length && (
            <p className="chat-empty">
              No scores yet. Publish yours in People.
            </p>
          )}
        </>
      )}
      {tab === "exchange" && <Trades game={game} />}
      {selected && (
        <div className="profile-drawer">
          <div className="profile-drawer-header">
            <Avatar profile={selected.profile} />
            <div>
              <h3>{selected.profile.nickName}</h3>
              <Badges ids={selected.badges} />
              <small>
                LV. {selected.level} · {selected.cards} cards
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Close collector profile"
              onClick={() => setSelected(null)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="profile-showcase">
            {selected.showcase.map((id, i) => (
              <button
                key={id + i}
                onClick={() =>
                  onInspect(id, {
                    instanceId: "",
                    cardId: id,
                    finish:
                      selected.showcaseCards?.[i]?.finish ??
                      (cardById.get(id)?.holo ? "holo" : "gloss"),
                    ham: selected.showcaseCards?.[i]?.ham,
                  })
                }
              >
                <CardView
                  card={cardById.get(id)}
                  finish={
                    selected.showcaseCards?.[i]?.finish ??
                    (cardById.get(id)?.holo ? "holo" : "matte")
                  }
                  ham={selected.showcaseCards?.[i]?.ham}
                />
              </button>
            ))}
          </div>
          {selected.profile.playerId !== me && (
            <button
              className="primary full"
              disabled={!isHere(selected.profile.playerId)}
              onClick={() =>
                void act(() => {
                  trading.invite(selected.profile.playerId);
                  setSelected(null);
                  setTab("exchange");
                })
              }
            >
              Start trade
            </button>
          )}
        </div>
      )}
      {picker && (
        <div className="ms-picker-backdrop">
          <div
            className="ms-picker"
            role="dialog"
            aria-modal="true"
            aria-label="Choose trade cards"
          >
            <div className="ms-picker-heading">
              <b>
                {confirmPost
                  ? "Confirm trade listing"
                  : picker.post
                    ? "Offer your cards"
                    : "Show off or trade"}
              </b>
              <button
                aria-label="Close card picker"
                onClick={() => setPicker(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="ms-picker-cards">
              {save.owned.map((c) => (
                <button
                  key={c.instanceId}
                  className={choice.includes(c.instanceId) ? "selected" : ""}
                  disabled={confirmPost}
                  onClick={() =>
                    setChoice((v) =>
                      v.includes(c.instanceId)
                        ? v.filter((id) => id !== c.instanceId)
                        : v.length < 3
                          ? [...v, c.instanceId]
                          : v,
                    )
                  }
                >
                  <CardView
                    card={cardById.get(c.cardId)}
                    finish={c.finish}
                    ham={c.ham}
                  />
                  <small className="ms-card-grade">
                    {c.ham ? `HAM ${c.ham}` : "UNGRADED"}
                  </small>
                  <small>{cardById.get(c.cardId)?.name}</small>
                </button>
              ))}
            </div>
            {confirmPost && (
              <p className="trade-post-confirm">
                {choice.length === 1
                  ? "Single-card trade"
                  : `Trade bundle · all ${choice.length} cards offered together`}
                . Collectors make an offer, then both confirm the exact cards
                before any exchange.
              </p>
            )}
            <div className="ms-post-actions">
              {!picker.post && !confirmPost && (
                <button
                  className="secondary"
                  disabled={!choice.length || busy}
                  onClick={() => void submitCards("showcase")}
                >
                  SHOW OFF
                </button>
              )}
              <button
                className="primary"
                disabled={!choice.length || busy}
                onClick={() => {
                  if (picker.post || confirmPost) void submitCards("trade");
                  else setConfirmPost(true);
                }}
              >
                {picker.post
                  ? "SEND OFFER"
                  : confirmPost
                    ? choice.length === 1
                      ? "CONFIRM SINGLE TRADE"
                      : `CONFIRM ${choice.length}-CARD BUNDLE`
                    : `POST TRADE · ${choice.length}/3`}
              </button>
              {confirmPost && (
                <button
                  className="secondary"
                  onClick={() => setConfirmPost(false)}
                >
                  BACK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export function Avatar({
  profile,
}: {
  profile: { nickName: string; avatar: string };
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [profile.avatar]);
  return (
    <div className="avatar">
      {profile.avatar && !broken ? (
        <img src={profile.avatar} alt="" onError={() => setBroken(true)} />
      ) : (
        profile.nickName.slice(0, 2).toUpperCase()
      )}
    </div>
  );
}
