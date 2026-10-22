# PACK MINI 1.1.2 verification

The1.1.1 binder features were correctly published; the collector confirmed they had viewed an old version. This release changes trading.

## Behavior

- A social offer includes its exact offered copies, requested copies and a device identifier. The accepting player reviews and confirms once. The offering client validates its own existing offer and current inventory automatically; another device under the same Aippy account ignores that device-bound exchange.
- A shared owner-written social record uses revision checks to decide prepare → commit or abort. The offering client applies first and publishes a durable application receipt; the accepting client applies after verifying it. Repeated messages and reloads are idempotent. Compact relay packets fetch full validated terms from the shared record.
- Foreground trades close after30seconds; Cancel/Close frees the screen even if a server request fails. Confirmed or uncertain exact-card reservations recover in background, allowing unrelated copies in other trades. Committed exchanges complete rather than returning previously exchanged originals.
- Expired legacy unsent journals whose reads prove no own confirmation/no peer completion can be cancelled locally when both write routes definitively reject storage. The old ghost banner stays closed and the original inventory remains intact. Legacy sent/uncertain journals retain only their exact locks.
- All pending journals and unapplied receipts survive history pruning. A durable commitAttempted marker prevents a later missing coordinator from being recreated as abort or treated as an unpublished swap. Device-bound term digests are independent of object-key order.
- Existing confirmed trades retain legacy recovery. Older social offers need resubmitting on the updated client to authorize the automatic flow.

## Evidence

-74 Node tests pass, including exact copy locks, unrelated concurrent/background trades, pending history retention after150cancellations, one-confirmation handshake, wrong device ignored, deadline abort, lost relay packets, reconstructed-client recovery, late prepared messages after abort, missing coordinator after peer application and explicit-cancel uncertainty guards.
- TypeScript/Vite production build passes; existing chunk-size/mixed-import warnings remain informational.
- Two browser contexts with real fixture HTTP/WebSocket boundaries pass chat/reactions/showoffs, legacy exact HAM10/HAM7 swap across reload and a new three-card-per-side bundle with only the accepting player confirmation. Both inventories and grades survive reload without duplication. Passed with the trading route both present and returning404; the new coordinator uses the existing social store.
- Browser trade-failure tests pass actual IndexedDB reload/UI cancellation and a60-second-old unsent journal with every trade-storage read/write returning404: original copy remains, reservation clears and another trade starts. Lost write acknowledgements keep sent copies reserved while freeing the foreground.
- Browser trade-prefill regression passes.
-280px/390px card UI checks pass opening swipes/grading, summary close, exact-copy sales, numeric binder counts, descending copy sort,3/4 layout toggle, brighter missing cards, sticky controls and pagination.
- Independent read-only review found two safety issues during development; regression tests now cover both fixes. Final review reports no new material findings.

The browser checks use fixture collectors/backend responses. The actual Aippy native host, user's local save and two live collector accounts were unavailable here; verify those after importing. Friend3's existing identity and generic social record contract are retained. No live inventory was changed during source verification.
