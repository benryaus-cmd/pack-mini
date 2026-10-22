# PACK MINI 1.1 — 23 October 2026

## Implemented

- Safe tilt area; next/grade require a horizontal drag of at least 34% of opening width, minimum100px and horizontal dominance1.5x. Arming glow/prompt precedes release; cancel clears it. Grade remains visible and immutable. Tap on a revealed card no longer advances it.
- Compact rarity/finish/price heading, adjacent opening actions, five-across summary. Completed close calls finishOpening; unfinished pack can still be saved for later. Bundle progress remains queued safely.
- Ordinary gloss, illustration-window holo, reverse artwork exclusion, full-card textured/rainbow/gold effects; shared renderer on opening, binder, inspector, social and trade surfaces. Large scans progressively upgrade. Remote inspection carries the shared finish and HAM snapshot.
- Exact representative-print finish metadata audit:662 cards,492 explicit variant declarations,170 conservative fallback records, zero missing source records. No separate finish scan is fabricated. Detailed source commit is in MINI-FINISH-AUDIT.json. Existing owned finishes/grades remain unchanged.
- Reverse Holos replaces English binder; holo/reverse ownership and badge loss require matching finishes. Binder controls stick, near-bottom loading adds48 slots, owned-value sorting places unknown values last. Value-toggle observer remount is covered.
- Best physical copy per artwork slot: HAM10>9>8>ungraded>7. Inspector selects an exact copy by grade, finish, language and position. Sale confirmation shows grade/finish/instance suffix; existing pending-pack and confirmed-trade locks remain enforced by the transaction.
- Shop order: First Friends800, All Stars1000, Japan1500, Holo2000. All Holo-pack cards have a holo treatment. Legacy mini-en packs remain in setById for pending-save compatibility.
- Persistent low-scan caching: six workers, one retry, 5s request timeout, 4.5s foreground loading limit. Remaining work continues in background; denied CacheStorage/network falls back to regular images. Detailed scans do not block flipping. Home shows latest five still-owned $10+ hits; celebrations at $10/$50/$100/$500 USD reference. Real FX is required for EUR threshold comparisons; no invented valuation.
- Dark social composer/pulls/picker; four compact emoji reactions and counts. Separate showoff posts and trade listings; explicit single/bundle confirmation. Own listing removal hides offers; compact author-controlled retirement records survive bounded history without reviving withdrawn listings or deleting known active posts. Receivers never infer retirement cutoffs from partial packet history.
- Whole ball-drop batch charges atomically and locks launches/tabs until all settle. Count, total stake, payout and net persist through reload; per-ball settlement stays idempotent.

## Validation

- `npm test`:60/60 passed.
- `npm run build`:passed. Vite's existing large-chunk/mixed static-dynamic import notices remain; no TypeScript/build errors.
- Phone browser suite:280/390px daily opening, four-pack fit, HAM10 grade/sale, badge loss, memory retry, global offers, no overflow/runtime errors.
- Update browser suite:280×560 and390×700 safe tilt (including old48px threshold), angle-light movement, right-arm grade, left-arm next, visible HAM, controls fit, five-column summary, summary close clears pending, big-hit home strip, highest-grade binder representation, exact ungraded/reverse sale leaves HAM10 untouched, pinned toolbar, automatic pagination including value-toggle remount, owned sorting and662 cached low scans.
- Two-context HTTP/WebSocket social suite:showoff vs trade UI, emoji/count relay, HAM/finish inspection snapshots, explicit single-trade confirmation, author-only withdrawal persisted/reloaded, original threaded offers and mutual HAM10/HAM7 trade after first-confirm reload without duplicate inventory.
- Arcade browser suite:real reel/ball motion, sequential stops, five live balls, seeded unfinished-batch reload recovery, exactly-once payouts; three-ball batch locks all launches and displays its150 stake/payout/net.
- Trade-prefill regression:passed.
- Independent read-only code review found history-rollover and observer-remount cases; both addressed with regression coverage and re-review.

## Limits of these checks

Browser fixtures serve a real local HTTP/WebSocket protocol and a known card scan/market quote. They do not establish current external game2 tunnel availability, live pricing/CDN availability, native Aippy identity, device motion permissions, or the final Aippy host build. Run the supplied1.1 update handover in the existing Aippy project for those platform checks. Saves retain the packmini-v1 namespace and game2/mini-lobby contracts.

The existing1.0 verification report describes that earlier release's actual Aippy-host checks; it is not evidence of1.1 having run in Aippy.
