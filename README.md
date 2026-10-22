# PACK MINI

Tiny packs, big feelings. A separate portrait collector game forked from PACKVERSE 1.2; the original Pack-Opener repository remains unchanged.

Collect distinct TCGdex artwork featuring Charizard, Pikachu, Mewtwo, Bulbasaur, Charmander, Squirtle, Greninja, Lucario, Eevee, Umbreon and Mimikyu. English/Japanese language slots share overlapping artwork binders. Complete a binder to display its gym badge; losing the last required card removes that badge. Your HAM 10 vault displays perfect graded instances.

## Play

- Four five-card pools: All Stars **1,000 credits**, English Club **1,200**, Japan Club **1,500**, First Friends **800**. One rare+ per pack. Tap pack → confirm buy. Daily free pack hero disappears after its claim.
- Start with **5,000 credits**. Daily reward **1,000**, memory win **250**. Missions, milestones and level rewards use the tenfold economy.
- HAM grading: one free roll per instance. HAM7 35%, HAM8 35%, HAM9 25%, HAM10 5%. Grades travel with trades. This is a game rating.
- Sell at a market reference ×100 credits per USD ×HAM factor: **ungraded .50 / HAM7 .30 / HAM8 .70 / HAM9 1.00 / HAM10 2.00**. A $1 reference returns50 ungraded,30/70/100/200 graded. Quotes are shown before confirmation; badge-loss warnings cover last copies. Alternate finishes and same-art printings provide labeled reference fallbacks; EUR-only references require an available USD FX rate. Missing references remain unavailable rather than invented.
- Four-life, retryable 4×3 memory; sequentially spinning reel strips; up to five Matter.js pegboard balls with persisted charges and deterministic recovery.
- Chat opens at latest messages. Like/dislike, post cards, reply with threaded offers, use the global Offers bell, then mutually confirm a live trade. Foil and grade markers show across owned-card surfaces.
- SomaFM **PopTron**, as used by Fidget, is off each session and starts from the top-bar button. Physical paper/foil foley accompanies tearing, crinkling and flipping.

## Run and verify

Node24 recommended. `npm ci`, `npm run dev`, `npm run build`, `npm test`. Browser checks: `npm run test:browser`, `npm run test:social`, `npm run test:trade`. `CHROMIUM_PATH` selects an installed browser.

See [Aippy import](AIPPY-IMPORT.md), [catalogue audit](docs/MINI-CATALOGUE-AUDIT.json), [credits](ASSET-CREDITS.md) and [verification](docs/MINI-VERIFICATION.md).

The initial catalogue contains the published, verified artwork available to this source snapshot; the audit records missing images and conservative perceptual grouping. Artwork thumbnails load directly from TCGdex `low.webp`; full views progressively use `high.webp`. Card artwork is never bundled.

Game2 uses the existing Friend3 backend in **mini-lobby**, with separate Mini data/leaderboard prefixes. Device saves use **packmini-v1**, separate from PACKVERSE. Scores, grading and trades are client-trusted within the supplied backend. Clearing a device save removes its local inventory. The temporary external tunnel requires a live check in Aippy.
