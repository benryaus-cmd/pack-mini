# PACK MINI — the collector game people come back for

**Wishlist and proposed direction · 23 October 2026 · based on 1.1.4 source and the supplied phone recording.**

This is a menu of possibilities and an order for exploring them, not a commitment to build everything. No gameplay or deployment changes accompany this document. Player reactions reported by the owner are encouraging; the retention and economy ideas below remain hypotheses to test.

## The ambition

Make opening a pack the beginning of a story: **“I found something. It helps my collection. I know what I want next. Someone else wants what I have.”**

The recommended direction is a **collector club with a living collection**. Keep the satisfying opener, then connect it to personal goals, short collection challenges, displays, trading and shared discoveries. It should work for original creatures, fantasy relics, cars, sports personalities, fossils, artwork or other collectible themes. Pokémon is the current content source, not the architecture or the long-term game design.

A great two-minute visit should deliver a choice, a reveal and visible progress. A longer visit should let someone pursue a collection, improve a display, play a challenge or find a trade. Returning should feel exciting because there is something worth doing, rather than because yesterday's progress is about to expire.

“AAA” here means coherent presentation, responsive touch, memorable rewards, reliable ownership and enough depth to support different kinds of collectors. A sprawling 3D world is not required.

## What the recording tells us

The reviewed recording is `Screen_Recording_20261023_123058_Aippy.mp4`, approximately 50 seconds. Times below are approximate observations, not diagnosed causes.

| Where | Visible evidence | Wishlist response |
| --- | --- | --- |
| Throughout | Aippy's page controls and outer chrome occupy substantial phone space. The game itself is a short portrait rectangle. | Design for the embedded game rectangle, measure its actual CSS dimensions, and test inside a replica host. A full-phone screenshot is insufficient. |
| Home, roughly 4–12s | Header, identity, balance, progress and bottom navigation compete with the collection and next action. | Compact shared chrome; lead with one personal goal and its next action. Keep identity/music accessible through smaller controls. |
| Social, roughly 12–28s | Tabs, chat, card posts, reactions and input share a narrow area. | One clear chat scroll surface, readable messages, usable input with the keyboard open, and compact card previews. |
| Enlarged card, around 20s | A card takes most of the available height; its details extend below the initial view. | Fit art, value, grade, selected copy and primary action into a deliberate inspection layout. Secondary history can expand below. |
| Binder, roughly 32–44s | Four-across is useful, but labels are tiny/truncated. The floating chat bubble overlaps cards. Switching controls is followed by an empty grid. | Keep the density choice; use concise metadata, move transient overlays away from hit targets, and investigate the empty-grid transition with a repeatable test. Do not infer inventory loss from this recording. |
| Throughout | The player moves naturally between collecting, chat and showing cards. | Treat social collecting as a central loop, not a separate chat room bolted onto a shop. |

First polish backlog: reproduce the binder disappearance; preserve scroll/filter state; distinguish loading, no matches and failure; make duplicate counts/finish/grade readable; test footer, bubble and modal overlap; make keyboard opening and app suspension recover cleanly. The recording does not establish whether live trades now complete on both devices.

## The strongest game direction

Three credible routes exist:

| Route | Attraction | Cost and risk | Recommendation |
| --- | --- | --- | --- |
| Collector club | Collection goals, curated exhibits, challenges and trades reinforce the existing game. | Requires thoughtful content and a trustworthy economy, but can grow incrementally. | **Build this first.** |
| Full card battler | Gives every card a tactical use and supports competition. | Rules, AI opponents, balance, matchmaking and new card data become another whole game. | Prototype later with a tiny original set before committing. |
| Market simulator | Shops, orders, auctions and collector reputation can create strong social stories. | A broken economy or insecure ownership ruins the premise; speculation can crowd out collecting. | Add selected features after server ownership, not an unrestricted market immediately. |

The club can eventually contain a battler and a market. Launching all three at once would make it harder to learn which part players actually love.

## The connected loops

### 1. Pick a chase, then feel every pack move it forward

Let players pin up to three goals: a favourite character, a finish collection, a themed page, or a specific missing card. Show a clear next step such as “two more night creatures”, “one reverse finish missing”, or “you have a duplicate someone wants”.

Give each pack an honest “helps your goals” explanation based on its published pool. Show that a card is new to the collection, new to this finish, a grade improvement or a useful spare. A cheap missing common can deserve a more personal celebration than an expensive duplicate.

**First slice:** pin one binder goal, calculate completion from existing copies, add progress to the reveal summary, and link to an eligible pack. No new backend is required for a local prototype. Success means players can explain what they are chasing and why they chose that pack.

### 2. Give duplicates a job

Offer several understandable choices: keep a spare, trade it, fill an NPC collector request, or spend eligible duplicates on a visible collection project. Preview exactly which instances, finishes and HAM grades are involved. Protect favourites, showcase pieces, last copies and reserved trade copies by default.

A long-term “research” or “archive” track could turn spare cards into guaranteed progress toward a selected ordinary missing card. Keep chase variants special; a universal button that prints the best card would erase trading and discovery. Start with fixed, auditable recipes, not random rerolls with unclear costs.

**First slice:** three rotating NPC requests, with one modest guaranteed reward and exact-copy confirmation. Later server authority must issue the reward and consume the copies in the same transaction. Measure whether players find duplicates useful without regretting irreversible exchanges.

### 3. Make the collection playable: short expeditions

A theme-neutral mode: choose three cards for a 60–120 second challenge, inspect a route, and make two or three meaningful choices. Collections provide tags and synergies, not just price. Example: a night creature, a flying creature and a guide form a moonlit expedition; a car collection instead enters a rally with surface, handling and endurance tags.

Use a small authored ruleset and transparent predicted bonuses. Collectibles return intact. Separate gameplay ratings from market reference price and HAM grade so cheap cards remain useful and grading does not become the only strategy. A borrowed starter selection keeps new players able to play.

Begin with turn-based route choices in React. Fancy live physics is unnecessary for the first proof. Rewards should come from completing the challenge, with bounded bonuses for better decisions; repeated unattended starts should not mint currency.

**First slice:** one route, twelve tagged cards and three encounter types; seeded replay tests; a clear reward receipt. Compare this against a simpler daily collection puzzle before expanding. The goal is a satisfying reason to own cards, not another timer to wait out.

### 4. Turn binders into exhibits people want to visit

Give each collector a small public display: six chosen cards, a title, a theme and a cosmetic backdrop. Support deliberate layouts, paired art, finish collections and favourite low-value pieces. Let visitors open the displayed exact copy and its earned provenance.

Add weekly exhibition prompts: “all one colour”, “underappreciated favourites”, “best three-card story”. Voting should have per-account limits and moderation; begin with curated participation rewards rather than valuable prizes for raw popularity. A small community should still have a lively gallery through opt-in asynchronous browsing.

**First slice:** a shareable six-card exhibit with reactions and a local editor. Later add server snapshots, privacy controls, reporting and revision history. Cosmetic rewards make participation worthwhile without inflating currency.

### 5. Make trading feel like finding the missing puzzle piece

Wishlists should power “you can help each other” suggestions. Allow wanted cards/finishes, single-card and bundle offers, clear availability, and asynchronous offers that can be withdrawn before acceptance. Offer history should explain accepted, declined, expired and completed states.

Show both sides' exact copies, HAM grades, finish and reference-price timestamp; explicitly mark unpriced cards. Price is context, not a claim that the trade is fair. Never silently swap a better graded copy into an agreed offer.

**First slice:** local wishlist plus live matching suggestions; measure completed and failed trades rather than counting invites. **Long-term dependency:** authoritative inventory and atomic server settlement before building a persistent marketplace. The current device journals are a prototype recovery mechanism, not a substitute for a central ownership ledger.

### 6. Build a personal collector career

Replace a generic XP ladder with visible identities: archivist, foil hunter, curator, helpful trader, expedition specialist. Let players progress in several tracks and choose which one to pin. Give titles, binder covers, display furniture, pack-opening surfaces and reveal styles.

Progress should come from varied meaningful actions, not sending spam messages, cycling the same card between accounts or repeatedly opening a menu. Rewards for trades need unique-partner and repetition controls. Accomplishments can persist even when a displayed collection badge still reflects current ownership.

**First slice:** three career tracks with five milestones each, reusing existing achievements where possible. Keep it legible: one next milestone at a time, not ten competing progress bars.

### 7. Give the whole club a reason to gather

Run a weekly expedition or community archive project. Players contribute gameplay discoveries, optional eligible spares or completed challenges toward shared milestones. Personal participation matters even in a small group; scale targets to measured active players and cap repeat contributions.

An event should include a different thing to do, a small story, a themed exhibit and an attainable memento. Rotate previous themes back through an archive so missing a week does not permanently block the collection. Give the event a published end time and a deterministic settlement job.

**First slice:** one weekend event with an admin preview, staged activation, contribution receipts and recovery after server restart. No manual database edits should be needed to finish it.

## Pack opening should be the signature moment

Keep one-thumb inspection and strong, unmistakable foil. Give gloss, reverse, holo and textured finishes different light behaviour across opener, binder and enlarged views. In a static binder, one restrained moving glint on selected/visible cards can communicate finish without animating every thumbnail continuously.

Build a reveal director with three inputs: **personal relevance, collection rarity and reference value**. A new favourite, completing a page, first holo, HAM10 or exceptional hit can each have a distinct cue. Reference-price celebrations should retain cached values and state when a price is unknown. Avoid dramatic fake-outs that promise a rare card and deliver nothing.

Wishlist details:

- A physical-feeling tear, short anticipation, a card sliding into light and a clean reveal beat, with synchronised foley/haptics.
- Distinct restrained, good, huge and exceptional celebrations; skippable, replayable from recent history and compatible with reduced motion.
- A summary that explains progress: new art, new finishes, useful duplicates, completed goals and rewards.
- An optional “open another” action beside collection actions, with its credit cost clearly visible.
- A shareable reveal clip or still using licensed/owned assets and the actual earned card; no personal identifiers included by default.
- Rare provenance such as “my first HAM10” or “completed the moon collection”, rather than inventing unsupported scarcity claims.

Retain existing GSAP/Motion, Howler and CSS effects. Establish one animation owner per element and one audio policy. Add a new rendering engine only after a measured limitation. Haptics and audio must degrade gracefully in the Aippy iframe.

## Phone presentation: treat available height as precious

Use the embedded viewport as the layout boundary. Instrument `clientWidth`, `clientHeight` and keyboard/visual-viewport changes in private QA diagnostics. Reproduce the recording's host shell, then record the actual CSS dimensions on the real device; video pixels are not CSS pixels.

Proposed acceptance matrix: approximately **280×420, 320×480 and 390×600 CSS pixels inside the host**, plus a larger tablet case. These are test targets, not measurements of the supplied phone. Include safe areas, text scaling, weak network, keyboard open and resume after backgrounding.

- A compact persistent header and bottom navigation; compress secondary profile information inside binders and inspections.
- Keep binder search/filter controls reachable. Collapse less-used sorting into a compact tray while retaining the selected sort label.
- Keep both three- and four-across. Prioritise artwork, copy number and grade; reveal full metadata on tap rather than shrinking all text.
- Do not let the chat bubble obscure the last card or the primary action. Offer a small docked badge or collapsible control.
- Enlarged card: value and grade on one row, visible exact-copy selector, and a compact action row. Preserve access to sell, show off and trade without an accidental gesture.
- Every async list needs stable items during refresh, a first-load state, an explicit empty state and an actionable failure state.
- Visible feedback immediately after a tap, repeat-tap protection for purchases, and a safe return path from every overlay.

Use Playwright for the repeatable viewport/keyboard/layout cases, and retain native Android/iPhone checks for iframe lifecycle, sound and touch behaviour. Automated mobile emulation cannot establish how the real Aippy app behaves on a physical phone.

## Content that can become anything

Separate four concepts currently mixed into Pokémon-specific fields: **card definition, printing/artwork, finish variant and owned instance**. Store set/theme and gameplay tags separately from display labels. Keep HAM attached to the instance; keep price quotes attached to the appropriate printing/finish and currency.

A content pack should provide a validated manifest: stable IDs, names, tags, artwork sizes, optional foil masks, rarity labels, pack pools/weights, mission templates, provenance and asset licence records. A theme adapter can map today's species/language fields into that model. Use aliases and migrations to retain existing IDs and saves.

Start with a complete small original collection of roughly 30–60 cards, with a deliberate distribution of common, specialist and chase designs. AI agents can draft themes, generate candidate art, validate metadata, find near duplicates, build thumbnails and render a contact sheet. A human still chooses quality, consistency and publishable rights. Add deterministic asset review and licence records; live generation during every pack opening is an expensive, inconsistent substitute for a curated catalogue.

Test portability by loading two very different catalogues into the same features. If an expedition or binder relies on hardcoded Pokémon names, the separation is unfinished.

## Economy: lasting goals without endless inflation

The existing free pack, missions, arcade rewards, selling and grading already form an economy. Model those sources and sinks together before adding more. Treat real-world reference dollars and game credits as separate concepts; reference quotes should not directly determine competitive power or real-money promises.

Maintain a versioned economy configuration. Simulate starter, casual, committed, duplicate-heavy and unlucky collectors. Report time to first chosen goal, daily credit creation/removal, collection completion, duplicate use and how often players hit a dead end. Test 7-, 30- and 90-day scenarios before live changes; these are design simulations, not predictions of actual behaviour.

Useful sinks include optional exhibit cosmetics, entry to a clearly priced challenge and transparent duplicate projects. Avoid repeatedly making players destroy favourites or buy more packs merely to keep playing. Keep an evergreen way to earn progress and an achievable guaranteed route toward ordinary collection goals.

Grading needs a deliberate product decision: preserve the current one-roll game mechanic for compatibility, then explore a cosmetic presentation/inspection minigame whose result is separate from HAM, rather than secretly changing existing grade odds. Publish odds and reward rules. Test changes on new/versioned products so historical packs remain explainable.

Measure repeat play alongside frustration, failed operations, and whether people achieve what they came for. Churn caused by lost cards or unreadable controls is not solved with bigger daily rewards. No streak resets that erase earned progress, compulsory notifications or unexplained odds manipulation.

## The infrastructure worth building

### Recommended first production shape

Keep the Aippy React/Vite client and current libraries. Build **one modular TypeScript service**, one **PostgreSQL database**, a background worker from the same codebase, stable HTTPS/WSS and versioned asset delivery. Avoid a microservice fleet for a small collector club.

Use **Fastify** for validated HTTP routes and **`pg` (node-postgres)** with explicit SQL migrations and transactions. Use the existing WebSocket approach for chat/presence/notifications; committed ownership lives in PostgreSQL. Keep Redis optional until measured cross-process coordination or queue volume requires it. Real-time battles could later justify **Colyseus**, but a collector economy does not require a room simulation framework.

Deploy a staging and production stack through Docker Compose with health checks, restart policies, persistent database volumes, encrypted off-host backups and a restore script. Asset hosting may begin as static versioned files behind HTTPS; move large licensed image/audio sets to object storage/CDN when traffic justifies it. Use a permanent hostname instead of a rotating development tunnel.

A starting capacity exercise could simulate 50 concurrent clients and a few hundred daily collectors. This is a load-test target, **not a hosting guarantee or a quoted bill**. Measure memory, CPU, database size, bandwidth, backup cost and provider pricing before selecting a paid machine; the existing constrained Friend3 sandbox is not presumed to have spare capacity.

### Ownership is the foundation

The server should own wallets, pack draws, grade results, reward claims, instance ownership and trade settlement. Client IndexedDB becomes a cache and offline operation journal. Read-only browsing and local practice can remain offline; authoritative economic actions require a server acknowledgement.

Proposed tables include players, collections, devices, catalogue versions, card instances, wallet entries, pack openings, trade offers/items, reward claims, event contributions and an outbox. Use unique operation IDs and immutable receipts. Enforce one current owner for each instance and one reward claim for each eligibility key.

For a trade, lock the relevant rows in a consistent order, verify both owners and the agreed terms, transfer both sides and write the receipt/outbox within **one database transaction**. Send notifications after commit; an outbox retries delivery. A reconnect asks for the operation's result rather than repeating a blind transfer. SQL transactions and locking support this design, but application invariants, deadlock retries and failure tests still have to be implemented.

Server time controls expiration. A scheduled worker expires uncommitted offers; committed transfers remain committed even if the notification fails. Never automatically “return” cards from an already settled trade because one client is offline.

### Identity and existing local collections

Continue using Aippy runtime identity. Before treating an account as an inventory authority, establish how the server can verify that identity: a client-supplied profile header alone is not a cryptographic ownership proof. Inspect the actual supported runtime/backend contract and implement the verified flow it supports; never invent a bearer token, shared client secret or undocumented endpoint.

The current same-account/two-device situation is intentional prototype behaviour. A migration must preserve both local collections: export a backup, assign an import receipt, preview both inventories and resolve instance collisions explicitly. Decide with the owner whether these become one account collection or named separate collections. Keep the original device snapshots recoverable. Already client-trusted history cannot retrospectively be made provably authentic, so identify imported legacy provenance rather than claiming it was server-issued.

Do not strand pending swaps during migration. Reconcile their durable decisions and exact-copy locks before importing tradable inventory. Roll out a separately versioned server contract and canary collection before replacing existing saves.

## How AI agents would actually deliver it

The owner should be approving playable builds and concrete deployment choices, not hand-writing infrastructure. AI can implement and operate the stack through repository access, a provisioned workspace and explicit account permissions. Purchasing infrastructure, proving domain ownership, granting credentials, rights review and final device judgement still require the owner's authority; AI should identify these handoffs precisely.

Every substantial feature should come with:

1. A small player story, a phone layout and observable acceptance criteria.
2. Versioned client/server contracts and migrations, plus an automated local environment with seeded accounts.
3. Unit/economy tests and two-client scenarios covering retries, suspension, disconnects, duplicate requests and different devices under one account.
4. A staging build, screenshots in the embedded viewport, logs and a short acceptance report that distinguishes simulated checks from live checks.
5. A rollout flag, recoverable backup, rollback instructions and operational documentation.

Suggested agent work packages: product/content design; phone UI; server/SQL; catalogue/assets; QA/security/economy; deployment/operations. Work can run in parallel after interfaces are agreed, with one integration owner reviewing the combined result. Keep tasks small enough to prove an end-to-end feature. More agents should not mean simultaneous edits to the same files or six incompatible architectures.

Build a content/admin workbench with scheduled-event preview, catalogue validation, moderation, read-only ownership audit and controlled corrective operations. Corrections require an auditable reason and receipt. Keep operator tools and server credentials outside public player flows. Add health/latency/error metrics, queue age, trade failure reasons, backup status and private correlation IDs. Periodically restore a backup into staging and prove that balances and ownership agree.

## Build order and playable gates

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 — Make today's game dependable | Phone polish, blank-grid reproduction/fix, lifecycle recovery, visible async states and current trade deployment checks. | Real phone recording of a complete collect → inspect → trade loop; automated regression for each diagnosed bug. |
| 1 — Give tomorrow's session a purpose | Pinned chase, personally relevant reveal summary, three NPC requests, first career track. | A new player chooses and advances a goal without an explanation from the developer; compare repeat visits and frustration against baseline. |
| 2 — Prove a use for the collection | One expedition route versus a daily collection-puzzle prototype; six-card exhibit. | Players voluntarily replay one of the prototypes; choose the stronger loop before making more content. |
| 3 — Establish trusted ownership | Staging backend, verified identity decision, SQL ledger, pack/reward authority, migration preview and atomic trades. | Duplicate requests, two devices, crash/restart and backup restore preserve exact balances and one owner per instance. Complete before valuable persistent-market expansion. |
| 4 — Build the club | Wishlists/matching, asynchronous offers, public exhibits, moderation and one community event. | A small group can discover, trade and contribute without the owner manually coordinating or repairing state. |
| 5 — Add a content engine | Theme manifests, asset pipeline, original mini-set, event/admin scheduling and measured economy tuning. | Two different themes run through the same collection/challenge/social flows; an AI produces a reviewed event release reproducibly. |
| 6 — Choose the ambitious expansion | Tactical draft battles, cooperative campaigns, player shops, asynchronous auctions, or a stylised collector-room hub. | A standalone prototype proves the chosen experience earns its additional server/content/UI complexity. |

Stages 1–2 can be local prototypes while stage 3 is prepared. Any shared rewards or persistent competitive economy must move behind authority before public rollout. This is an order of dependencies, not a promise of fixed dates.

## Longer-term dream features

- **Draft nights:** everyone gets temporary equal-pool cards, makes a few meaningful choices and competes in a short challenge; owned wealth does not decide the winner.
- **Co-op archive campaigns:** chapters unlocked by collective discoveries, with catch-up access and permanent story rewards.
- **Collector-room dioramas:** small, beautiful animated displays with a lightweight 2D first version; add 3D only when it improves the result on the actual phone.
- **Provenance stories:** first finder, exhibitions attended and player-approved trade history. Separate earned history from unverifiable legacy imports and privacy-sensitive identity.
- **A real collector market:** wanted orders, timed listings and later auctions with server escrow, anti-abuse rules and deterministic settlement. Begin with game credits and clearly scoped item rules.
- **Creator collections:** reviewed original mini-sets made through the asset pipeline, with consistent mechanics, moderation and explicit publishing rights.
- **Skill-based postcard challenges:** a daily composition, memory or expedition puzzle using a shared loaner pool; rewards support collecting without replacing it.
- **Seasonal festival nights:** synchronous pack reveals and shared reactions, with an asynchronous replay/gallery so attendance is optional.

## What to deliberately postpone

An MMO city, unrestricted user uploads, real-money cash-out, blockchain ownership, live AI-generated cards, many currencies and a complete competitive TCG ruleset would each add a large new operational burden. They are not prerequisites for a memorable collector club. Prove the chase → use → display → trade loop first.

## The first build I would choose

**“My next great find.”** Compact the phone chrome, fix the blank binder transition, let someone pin a collection goal, explain each reveal's contribution, offer one useful duplicate request and give them a six-card exhibit to share. Prototype one expedition immediately after that. In parallel, design the authoritative ownership migration before expanding the market.

That gives the player something to want, something to do with what they find, and someone to show it to.

## Primary technical references

Reviewed for this wishlist on 23 October 2026. These support the proposed implementation building blocks; they are not evidence that this game's deployment already has them.

- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html) — row locks and concurrency/deadlock behaviour relevant to settlement.
- [node-postgres transactions](https://node-postgres.com/features/transactions) — execute a transaction using one checked-out database client.
- [Fastify documentation](https://fastify.dev/docs/latest/) — TypeScript HTTP service, route validation and testing documentation.
- [Playwright emulation](https://playwright.dev/docs/emulation) — viewport, touch and device-context testing; supplement with physical Aippy-device checks.
- [Colyseus documentation](https://docs.colyseus.io/) — an optional authoritative room-server framework if a later multiplayer gameplay prototype requires it.

Repository grounding: `README.md`, `src/game/types.ts`, `src/components/Pages.tsx`, current service/module layout, and the owner's phone recording. Proposed features are wishlist items, not descriptions of implemented functionality.
