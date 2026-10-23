# PACK MINI

See the [AAA collector-game wishlist](WISHLIST.md) for the proposed direction beyond pack opening, phone priorities and an AI-deliverable roadmap.

Tiny packs, big feelings. A separate portrait collector game forked from PACKVERSE 1.2; the original Pack-Opener repository remains unchanged.

Collect distinct TCGdex artwork featuring Charizard, Pikachu, Mewtwo, Bulbasaur, Charmander, Squirtle, Greninja, Lucario, Eevee, Umbreon and Mimikyu. English/Japanese language slots share overlapping artwork binders. Complete a binder to display its gym badge; losing the last required card removes that badge. Your HAM 10 vault displays perfect graded instances.

## Play

- Four five-card pools: First Friends **800 credits**, All Stars **1,000**, Japan Club **1,500**, Holo Club **2,000** (all five cards holo). One rare+ per pack. Tap pack → confirm buy. Daily free pack hero disappears after its claim.
- Start with **5,000 credits**. Daily reward **1,000**, memory win **250**. Missions, milestones and level rewards use the tenfold economy.
- HAM grading: one free roll per instance. HAM7 35%, HAM8 35%, HAM9 25%, HAM10 5%. Grades travel with trades. This is a game rating.
- Sell at a market reference ×100 credits per USD ×HAM factor: **ungraded .50 / HAM7 .30 / HAM8 .70 / HAM9 1.00 / HAM10 2.00**. A $1 reference returns50 ungraded,30/70/100/200 graded. Quotes are shown before confirmation; badge-loss warnings cover last copies. Alternate finishes and same-art printings provide labeled reference fallbacks; EUR-only references require an available USD FX rate. Missing references remain unavailable rather than invented.
- Four-life, retryable 4×3 memory; sequentially spinning reel strips; up to five Matter.js pegboard balls with persisted charges and deterministic recovery.
- Chat opens at latest messages. React with 👍 😮 ❤️ 😢, show off graded cards or confirm single/bundle trade listings, remove your listings, reply with threaded offers, use the global Offers bell, then mutually confirm a live trade. Foil and grade markers show across owned-card surfaces.
- SomaFM **PopTron**, as used by Fidget, is off each session and starts from the top-bar button. Physical paper/foil foley accompanies tearing, crinkling and flipping.

## 1.1 card experience

Drag within the card to catch gloss/foil light. Drag at least 34% of the screen width (minimum 100px) left to advance or right to grade; the edge glows and the release action appears only when armed. Grading stays on the current card. Close a completed five-column summary to finish its pack.

Reverse Holos replaces the English binder. Holo/Reverse binder progress requires the owned finish; printed rarity stays separate. Ordinary saved `matte` cards retain their IDs and values while displaying gloss. Exact representative-print variants come from the pinned TCGdex source in `docs/MINI-FINISH-AUDIT.json`; scans are shared per printing, with masked foil distinguishing treatments. Missing variant metadata stays conservative. Existing inventories/grades and unfinished English packs remain valid.

Binder controls stay at the top, more art loads on scroll, and VALUE sorts owned cards by USD market reference (unpriced cards last). Binders default to four cards across, with a3/4-across toggle, with missing artwork dimmed to36% opacity and80% grayscale. Owned slots show their copy count. COPIES sorts owned slots by the most copies first, counting only finishes eligible for that binder. Slots show the best copy: HAM10 > HAM9 > HAM8 > ungraded > HAM7. Open it to select the exact copy/finish before grading or selling; the confirmation identifies its grade, finish and instance suffix.

A short startup screen warms all low-resolution scans into a persistent cache with six workers and one retry. After 4.5s the game is usable while remaining scans continue; network/cache failures preserve normal image fallbacks. High-resolution scans load progressively when enlarged. Big-hit history shows the latest five still-owned cards valued at US$10+, with reveal celebrations at $10/$50/$100/$500. EUR values use an available real exchange rate before entering dollar thresholds; unknown values do not receive invented valuations.

Coin Drop locks one 1–5-ball batch until all settle and retains its aggregate stake/payout/net across reload. Social showoffs persist in bounded server history rather than expiring as trade invitations. Withdrawals retain compact removal records independently of rolling messages, with retired-history cutoffs preserving known active posts. Completed/confirmed trades continue to use their existing immutable instance/digest checks.

## 1.1.1 social repair

The public server/room editor is removed; MINI connects to its configured game2 lobby. Chat leaves 3% side gutters for page scrolling. Confirmations use the existing generic trading store, with the existing social store as fallback when the trading route rejects writes. The server receipt precedes a ready notification. Reopened local-only confirmations show Retry or Cancel unsent trade; cancellation is persisted before releasing exact-copy reservations. Confirmations already on the server remain reserved for recovery. Existing saves and grades stay intact.

## 1.1.2 trade completion

Submitting a social offer authorizes the exact offered copies for the exact requested cards on that device. The listing owner reviews and confirms once; the offering client verifies its authorization and current inventory automatically. A shared owner-written record commits or aborts the swap; the offering device applies first and publishes its receipt before the accepting device applies. Repeated packets/reloads remain idempotent. Bundles use small routing packets and fetch validated terms from the existing social store.

Trades close automatically after30seconds. Expired, verified unsent legacy journals are cancelled even when writes definitively return404; Cancel/Close always frees the foreground. Sent or uncertain exchanges keep only their exact-card reservations in background while unrelated cards remain tradable. A committed exchange completes through recovery rather than returning exchanged cards. Pending journals and unapplied receipts survive bounded history pruning. Device IDs distinguish separate local collections under the same Aippy account. Pre1.1.2 offers need resubmitting to authorize the new automatic flow; existing confirmed trades use legacy recovery.

## 1.1.3 remembered prices and public startup recovery

Collection value, owned price sorting and big hits hydrate synchronously from the last known per-card/finish quotes. Market refreshes run in background and update owned prices as one complete batch; unavailable card/FX requests retain the previous usable quote. Totals are always derived from currently owned copies, including duplicate counts, so removed or sold cards stop contributing immediately. The first run builds the persistent cache; subsequent reloads reuse it. Single-card views also show cached prices while refreshing.

The supplied outer host handles startup/render failures with Copy Error and Try Again only, labelled PACK MINI. Its public error panels have no project-file callbacks or actions. Settings → temp save →1234 remains the private file-viewer path. The reported opaque Script error is still surfaced; retry behavior remains available.

## 1.1.4 relay trades

The live recording exposed a404 when creating generic trade records, before any client handshake could proceed. New trades now use device-local durable journals and Friend3's working WebSocket relay. The accepting device atomically commits or aborts in its own saved journal; the offering device verifies its posted authorization and exact inventory, applies first and sends its receipt. The accepting device then applies and acknowledges. Chunked bounded messages fit the existing relay envelope. Generic JSON record availability is not required for new swaps. Existing server-backed/legacy journals retain their separate recovery paths.

Both collectors need this update and a fresh offer. A30-second timeout before commit saves an abort before releasing the accepting device's originals. After commit, only exact swap copies remain reserved during reconnect recovery while other cards stay tradable. Separate device IDs distinguish independent local collections under one Aippy account. The1.1.3 remembered-price and public-safe error screen changes are included.

## Run and verify

Node24 recommended. `npm ci`, `npm run dev`, `npm run build`, `npm test`. Browser checks: `npm run test:browser`, `npm run test:social`, `npm run test:trade`, `npm run test:update`, `npm run test:arcade`, `npm run test:trade-failures`. `CHROMIUM_PATH` selects an installed browser.

See [Aippy import](AIPPY-IMPORT.md), [catalogue audit](docs/MINI-CATALOGUE-AUDIT.json), [credits](ASSET-CREDITS.md) and [verification](docs/MINI-VERIFICATION.md).

The initial catalogue contains the published, verified artwork available to this source snapshot; the audit records missing images and conservative perceptual grouping. Artwork thumbnails load directly from TCGdex `low.webp`; full views progressively use `high.webp`. Card artwork is never bundled.

Game2 uses the existing Friend3 backend in **mini-lobby**, with separate Mini data/leaderboard prefixes. Device saves use **packmini-v1**, separate from PACKVERSE. Scores, grading and trades are client-trusted within the supplied backend. Clearing a device save removes its local inventory. The temporary external tunnel requires a live check in Aippy.
