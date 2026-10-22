# PACK MINI 1.1.3 verification

## Changes

- The outer host uses a public-safe startup/render boundary with only Copy Error and Try Again. It has no file-viewer callbacks or actions. The Settings → temp save →1234 private viewer path remains wired through ImportedGame. Error branding reads PACK MINI.
- The opaque Script error reported after abrupt closure remains reportable/retryable; this patch addresses the public Project Files action, rather than claiming a diagnosis of an unavailable native/cross-origin stack.
- Per-card/finish prices and converted USD references persist in packmini-prices-v1. Collection value, big hits and owned value sorting initialize synchronously from known quotes. The first updated run builds the cache; later reloads reuse it.
- Owned prices refresh atomically after a complete background batch, avoiding partial totals and cycling hit lists. Failed pricing/FX keeps the last complete usable quote. Individual card refreshes use the same FX retention rule, and cached individual prices remain visible while refreshing.
- Totals are derived from currently owned copies rather than a saved aggregate. Duplicate counts, sales/removals and inventory changes immediately adjust the cached total without leaking a previous inventory total. Sale confirmation continues to use its existing live quote path.

## Evidence

-74 Node tests pass; TypeScript/Vite production build passes. Existing chunk-size and mixed-import warnings remain informational.
- Browser cache regression reproduced the original first-render zero/empty hit list before implementation. It now verifies a70 total and two hits on the first frame after reload, keeps70 while only one refreshed request completes, then updates once to90. Offline reload retains90; removing a copy immediately shows60.
- EUR regression reproduced an individual refresh overwriting a cached converted quote. It now retains the prior EUR50/USD100 entry when EUR60 arrives during an FX outage, and the card remains a hit after another offline reload.
- Browser host regression reproduced the public Project Files action. The actual supplied outer App now passes simulated global Script error and React render failure checks with only Copy Error/Try Again; copying, retry recovery, code1234 viewer access and closing the viewer all work against fixture host integrations.
-280px/390px browser checks pass reveal tilt/swipes, grading, summary close, big hits, exact-copy sale, numeric counts, owned value sorting, copy sorting,3/4 columns, missing-card visibility, sticky controls and pagination.
- Focused independent review identified the FX writer issue during development; its failing/passing regression is included. No material host-boundary findings were reported.

Browser tests use controlled pricing and host integration fixtures with installed Chromium. The actual Aippy host/native runtime and the user's existing local inventory remain live checks after import. The full snapshot retains76 upstream files and five host replacements; source hashes and downloaded bytes are validated by the importer.
