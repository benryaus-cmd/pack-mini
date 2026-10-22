# PACK MINI 1.1.4 verification

## Reported failure and change

The supplied native recording shows acceptance failing on a generic `/data/social/mx_<id>` write with HTTP 404 before the other client receives a handshake. Earlier browser fixtures allowed that write and therefore missed the deployment failure. Direct access to the deployed backend is blocked from this environment, so no live-server contract or two-account native verification is claimed.

New trades use protocol 3 over the existing authenticated live relay, without generic HTTP trade records. Only the accepting collector confirms. The offering device checks the posted offer and exact local copies, persists its reservation, and responds automatically. The accepting device durably chooses commit or abort once; the offering device applies first and returns a receipt before the accepting device applies. Exact instance IDs, finish and HAM grades survive the exchange. Device IDs distinguish separate collections signed into the same Aippy account.

Before commit, the accepting device aborts at 30 seconds even if offline. The foreground closes after 30 seconds; a committed exchange retains only the relevant exact-copy locks and retries receipts in the background. A committed exchange cannot be cancelled into a duplicate. Pending decisions and receipts survive reload. Relay fragments are bounded and reassembled independently of arrival order; retry work prioritizes the foreground, rotates older work and respects queue backpressure. Old protocol 2 and legacy recovery remain available.

This full snapshot also includes the unimported 1.1.3 changes: remembered card values with background refresh, stable last-hit valuation during loading, and public error screens without a Project Files button. Existing progress and identity namespaces are preserved. Both collectors must update and submit a fresh offer to exercise protocol 3.

## Validation

- `npm test`: 82 passed, zero failures. Includes eight protocol 3 tests covering exact copies/grades, wrong-device exclusion, lost messages and reload, delayed packets, reordered fragments, cancel/commit races, postcommit recovery, retry backpressure and offline deadlines.
- `npm run build`: passed; existing bundle-size warnings remain.
- `npm run test:social`: passed normal social/legacy fixtures plus a three-card relay swap with only one accepting-player confirmation.
- `npm run test:relay`: passed with every generic record route forced to HTTP 404; no generic trade record requests were made. Both inventories and HAM grades survived reload.
- `npm run test:trade-failures`: passed missing-route cleanup, old unpublished journal reload, cancellation and subsequent trading.
- `npm run test:cache`: passed synchronous cached totals/hits, atomic background refresh, offline retention and immediate exclusion of sold copies.
- `npm run test:host-error`: passed startup and React error screens with only copy/retry, successful retry, and private Settings/code1234 file-viewer access.

Native Aippy import and a real two-collector live trade remain deployment checks, not locally verified results.
