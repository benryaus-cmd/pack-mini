# PACK MINI verification — 22 October 2026

- Catalogue: only the eleven requested species; English and Japanese artwork; all included images verified from the published asset index and actual decoded low.webp files. Perceptual artwork grouping removes reprint aliases while retaining language slots. See the machine-readable catalogue audit for counts and exclusions.
- Engine tests cover tenfold credits, daily/reward idempotency, pack grants/reload, sale multipliers, stale quote after grading, last-copy overlapping badge changes, grading probability boundaries, immutable grades and grade-preserving trade digests.
- Matter tests and browser checks cover physical motion/peg collisions/bins, five concurrent balls, persisted charges, deterministic reload settlement and replay protection. Reel strips move and stop in sequence on saved outcomes.
- Two-context social test uses actual HTTP/WebSocket relay for replaceable votes, public card posts, threaded replies, persisted reload, chat history/new-message scrolling, HAM10 marker and notification UI.
- Phone UI checks at 280/390px widths cover daily free hero hiding, all four packs fitting, HAM10 grade and 200credit sale for a $1 reference, badge warning/removal, four-life loss/immediate retry, global Offers access and no horizontal overflow/runtime errors.
- Trade prefill regression covers old requested cards staying out of subsequent trades.

Market/media/FX providers are external. Missing quotes remain unavailable. Pricing fallback to other finishes or same-art printings is labeled a reference. Live external tunnel transport and actual native Aippy identity/motion permissions still need the platform environment; local multiplayer fixtures are tests, not a shipped replacement backend.

## Recorded results

- `npm test`: 50/50 passed; `npm run build`: passed (336.34KB gzip main JS).
- Phone browser suite: passed at 280px and 390px. Two-player social/trade suite: passed, including HAM10/HAM7 exchange after a first-confirm reload, unchanged grades/finishes and no duplicate inventory. Trade-prefill regression: passed. Arcade browser suite: passed, including five live physics balls and exactly-once reload recovery.
- Separate actual Aippy host copy: Node fetched five host replacements, then its normal Vite8 build downloaded and promoted70/70 hash-verified files from the published commit. Existing native compatibility, SDK plugins, project manifest and single-file bundling retained. Build passed.
- Built Aippy host loaded in Chromium at390×844: visible game, one root, four packs, radio off, no floating project button. Settings temp save rejected0000 and unlocked1234. Zero runtime errors.
- Catalogue snapshot:699 verified print images grouped into614 artworks and662 language/art slots (598 English,64 Japanese).493 source candidates with unavailable published artwork are excluded and listed in the audit. Coverage is the available TCGdex source snapshot; perceptual grouping is conservative, and is not a claim of every historical print/artwork worldwide.
- Live tunnel `/game2/config` request returned403 `Your request was blocked` from this environment. External-server two-player transport and native Aippy identity/device motion remain unverified here. Two-context synchronization tests use an HTTP/WebSocket test relay implementing the supplied protocol; the shipped app continues to use the existing game2 backend, not that fixture.
