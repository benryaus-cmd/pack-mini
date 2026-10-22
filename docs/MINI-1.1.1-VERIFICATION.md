# PACK MINI 1.1.1 verification

## Changes

- Remove the public connection editor and use the configured game2 / mini-lobby destination. Old local host overrides are cleared.
- Leave 3% side gutters around the chat scroll area and composer.
- Persist trade readiness before notifying the other collector. A missing trading write route falls back to the existing social generic-record namespace with the same owner/digest/revision checks.
- Recover old local-only confirmations as unsent. Retry publishes them; Cancel unsent trade persists cancellation before releasing reserved exact copies. Server-confirmed or uncertain confirmations retain reservations for recovery.
- Binders default to four cards across with a3/4-across toggle. Missing artwork uses36% opacity and80% grayscale (previously26% and90%), retaining a clear unowned state. Owned binder slots show copy counts. COPIES sorts qualifying owned artwork slots by descending copy count while preserving the highest-HAM representative and exact-copy selection/sales. Language-specific binders count exact printings; foil binders count qualifying finishes. The HAM10 vault retains one slot per perfect instance.

## Validation

- 63 Node domain/service unit tests pass.
- TypeScript and Vite production build pass. Existing large-chunk and mixed import warnings remain informational.
- Browser trade-failure regression passes: missing endpoint fallback; ready notification after persistence; persisted old journal across browser reload; UI cancellation followed by a new trade; reservation remains released after another reload; rejected new writes clean up; a lost write acknowledgement retains reservations and recovers its durable receipt.
- Two independent browser contexts pass chat, showoffs, reactions, offers and exact HAM10/HAM7 trade settlement across confirmation/reload, both with the normal trading namespace and with its endpoint returning404 and social fallback active. These checks also verify no public connection editor and 3% gutters.
- 280px and390px browser checks pass reveal tilt/swipes/grading, summary close, copy selection and exact sale, sticky binder controls, pagination, value sort, numeric count updates5→4 after sale and descending copy sort4→2 while retaining HAM10. Computed styles verify the3/4-across toggle and the brighter missing-card opacity/grayscale.
- Trade prefill regression passes.

Browser tests use HTTP/WebSocket fixtures and an installed Chromium selected with CHROMIUM_PATH. The actual Aippy native host and two live collector accounts are unavailable here. The configured external backend returned403 (request blocked) from this environment; live endpoint availability and the user's actual saved journal require the supplied Aippy update/check. No live save was modified during source verification.
