UPDATE THIS CURRENT PACK MINI AIPPY PROJECT TO 1.1.0.

Use the existing working PACK MINI project as the destination. Apply the tested full snapshot and keep PACK MINI opening directly.

SOURCE

Repository:
https://github.com/benryaus-cmd/pack-mini

Commit-pinned manifest:
https://raw.githubusercontent.com/benryaus-cmd/pack-mini/afa2441fd9f88b2094c4718724d188c54ca5dcd6/updates/pack-mini-1.1.0.json

Version: pack-mini-1.1.0
Mode: full-snapshot
Host replacements: 5
Upstream files: 74
Source commit: fb7f7d278dc4eff2fa3f75d8aa0910507b172fe8

Use manifest.baseUrl, which is pinned to the source commit, for every source download.

1. PREPARE THE FIVE HOST FILES BEFORE VITE LOADS

Inspect the existing importer and project root first. Resolve the current root using its package.json and vite.config.ts.

Use Node fetch in the existing Aippy build environment to download all five manifest.hostFiles as bytes using manifest.baseUrl + entry.source. Verify each byte count and SHA-256 before replacement.

Their targets are relative to the current Aippy PROJECT ROOT:

build/aippy-host/vite-plugin-github-import.ts
→ vite-plugin-github-import.ts

build/aippy-host/packverse-host-patches.ts
→ packverse-host-patches.ts

build/aippy-host/vite-plugin-packverse-css.ts
→ vite-plugin-packverse-css.ts

build/aippy-host/App.tsx.txt
→ src/App.tsx

build/aippy-host/ImportedGame.tsx.txt
→ src/games/importedGame/ImportedGame.tsx

Create destination parent directories. Stage validated bytes in uniquely named files beside their destinations, keep recoverable originals, then promote the complete host set. Report the original filesystem error code, operation and exact path if preparation fails.

The .tsx.txt source files become the listed .tsx targets. The importer and its packverse-host-patches.ts helper must exist before Vite evaluates the configuration. Their compatibility filenames are intentional.

After validating the downloaded importer, set its MANIFEST_URL constant to the exact commit-pinned manifest URL above. The supplied importer expects pack-mini-1.1.0 and 74 upstream files. This explicit URL prevents a cached older main-branch manifest being selected.

Complete host preparation as a separate awaited step before starting the normal build.

2. KEEP THE EXISTING HOST INTEGRATION AND DEPENDENCIES

Merge the imported package.json runtime dependencies with the current host package.json and update its existing lockfile using its package manager:

matter-js: ^0.20.0
@types/matter-js: ^0.20.2 (development declarations)

Resolve the supplied @aippy/runtime, gsap, howler, lucide-react, motion, react and react-dom against the existing host. Use one shared React/ReactDOM installation.

Preserve the host build scripts, required Aippy plugins, native user compatibility loader, project-file manifest, single-file packaging, clipboard utilities, GameLoadBoundary, GameFailurePanel, ProjectFileViewer and required outer styles/tweak configuration. Resolve actual import or prop mismatches against the current host.

3. REPLACE THE COMPLETE UPSTREAM SNAPSHOT

Run the normal build with the new importer. Download all 74 manifest.files using manifest.baseUrl + entry.source.

These targets are relative to:

src/games/importedGame/upstream/

Stage the entire snapshot and verify all byte counts and SHA-256 hashes. Promote it as a complete replacement after every file validates. Keep the previous validated snapshot available if preparation fails. Invalidate older snapshot caches by version and manifest digest; record the successful 1.1 version only after promotion.

Sync the supplied public fonts. Keep TCGdex low.webp/high.webp image URLs and the thumbnail-cache/progressive-resolution logic supplied in this release. The new game modules and mini-update.css are part of the 74-file snapshot.

4. MOUNT THE SAME SINGLE GAME

Keep this active chain:

Existing src/main.tsx
→ root src/App.tsx
→ src/games/importedGame/ImportedGame.tsx
→ src/games/importedGame/upstream/src/App.tsx

Root App is the supplied loading/error/file-viewer integration; upstream App is the actual game. Keep one React root and definite usable height through the outer mount, adapter, .desktop-scene and .game-root.

Use the supplied CSS-scoping plugin for every imported game stylesheet, including mini-update.css. Keep the mobile game visible while decorative desktop sidebars collapse.

5. PRESERVE EXISTING PROGRESS AND SERVICE CONTRACTS

Use the supplied save/service implementations with the current user identity:

- packmini-v1 IndexedDB saves
- packmini-settings
- game2
- mini-lobby
- MINI server-record namespaces
- official Aippy runtime user identity

The existing inventory, credits, instance IDs and immutable HAM grades remain valid. Legacy unfinished mini-en packs remain resolvable even though the shop now offers Holo Club instead. Existing saved matte cards display gloss while retaining their stored identity and economic treatment.

Preserve the existing confirmed-trade digest/instance checks and transaction locks. Social listing withdrawal affects the advertisement and its offers; exchanges continue through the existing mutual confirmation process. Use the supplied author-owned removal history and validate incoming records.

Keep radio off by default and start it only from its top-bar control. Settings → temp save → 1234 continues to open the working file viewer, and closing it returns to the mounted game.

6. BUILD AND CHECK THE ACTUAL RESULT

Run the normal Aippy build and resolve actual dependency, TypeScript, import, CSS and runtime failures until PACK MINI visibly loads.

Verify at portrait phone sizes:

- Startup displays artwork-cache progress briefly, then opens the game. Cached low scans are reused; unavailable network/cache falls back gracefully. High scans upgrade enlarged views progressively.
- Shop order is First Friends 800, All Stars 1000, Japan 1500, Holo Club 2000, from top left to bottom right. All five Holo-pack pulls have holo treatments.
- Rip/reveal works. Small thumb drags adjust the light while keeping the current card. Long left drags arm a left glow/release-next prompt. Long right drags arm a right glow/release-grade prompt; releasing grades that same card and displays its HAM result. Repeat grading retains the original grade.
- Rarity, finish and compact price are visible together. Opening actions sit adjacent. $10/$50/$100/$500 USD-equivalent market references get escalating pull celebrations when pricing/FX is available.
- Summary has five columns. Closing its X finishes the completed pack, and View Cards also finalises it. Queued bundle packs remain recoverable.
- The home page shows the last five still-owned $10+ hits when priced.
- Ordinary cards have visible gloss; Holo, Reverse Holo and textured finishes visibly differ in opening, binder, enlarged, chat and trade views. Common/Uncommon finish labels remain explicit. Shared source scans use the supplied appropriate foil masks.
- Reverse Holos replaces the English binder; qualifying holo and reverse ownership fill the correct binder slots and badges. Scrolling near the bottom loads more art. Compact binder controls stay pinned. VALUE sorts owned cards and continues loading correctly after toggling back.
- A duplicate slot displays the best copy in this order: HAM10, HAM9, HAM8, ungraded, HAM7. Enlarging it provides a physical-copy selector. Select an ungraded copy beside a HAM10 copy and check that the sale confirmation identifies the chosen grade/finish/instance. Selling removes only that copy. Existing pending-pack/trade locks and badge warnings remain effective.
- Chat composer, pull tiles and card picker are readable. The react button offers thumbs-up, wow, love and sad, with counts for used reactions.
- SHOW OFF posts a graded/finished card as a message; POST TRADE requires explicit single-card or complete-bundle confirmation. The owner can remove a trade listing and its offers stay unavailable after reload. A showoff preserves its grade/finish when inspected.
- Coin Drop locks the chosen batch until all balls settle. A three-ball play reports the full 150-credit stake, total payout and net gain/loss. Reloading unfinished balls preserves the charge and settles each once.
- Reload restores progress; radio/file-viewer controls still work; one active game root remains.

Use two independent collectors for live chat/reactions/showoffs, withdrawal propagation, threaded offers, and a mutually confirmed graded-card trade. Report unavailable external/native checks accurately.

REPORT

Manifest: pack-mini-1.1.0
Host files validated/replaced: X/5
Upstream files downloaded/validated: X/74
Upstream files promoted: X/74
Active game entry: exact path
Shared React root: YES/NO
Build: PASS/FAIL
PACK MINI visibly loaded: YES/NO
Opening tilt/armed-next/armed-grade: PASS/FAIL/UNTESTED
Five-column summary/close: PASS/FAIL/UNTESTED
Holo/reverse/gloss presentation: PASS/FAIL/UNTESTED
Exact-copy selection/sale: PASS/FAIL/UNTESTED
Binder scroll/sticky/value toggle: PASS/FAIL/UNTESTED
Holo pack/order: PASS/FAIL/UNTESTED
Social showoff/reactions/withdrawal: PASS/FAIL/UNTESTED
Three-ball totals/reload: PASS/FAIL/UNTESTED
File viewer: PASS/FAIL/UNTESTED
Live two-collector checks: exact result
First remaining error: NONE or exact error

Complete this update and wiring in the current PACK MINI Aippy project.
