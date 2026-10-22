Create a SEPARATE PACK MINI Aippy game from the existing PACKVERSE host project, using the Node build-time importer. Keep the original PACKVERSE Aippy project available independently.

Repository: https://github.com/benryaus-cmd/pack-mini
Manifest: https://raw.githubusercontent.com/benryaus-cmd/pack-mini/main/updates/pack-mini-1.0.0.json
Expected version: pack-mini-1.0.0

Use Node fetch during build preparation, before loading Vite config, to read the manifest and replace the five hostFiles using manifest.baseUrl + source and each exact target. These update the importer, host validator, CSS scoper, outer App and ImportedGame adapter. Keep the existing Vite config, SDK plugins, aippyUserCompatibility loader, project-file manifest, and single-file bundling. Add matter-js to the host runtime dependencies.

The normal Vite build then downloads all 70 manifest.files as bytes, validates hashes, and promotes their relative targets to src/games/importedGame/upstream/. Sync public fonts through the importer. Card artwork loads directly from TCGdex low.webp/high.webp. Render one root through ImportedGame → upstream/src/App.tsx. The Mini adapter keeps radio off until its top-bar button is pressed; the old automatic host theme is replaced by session-only SomaFM PopTron.

PACK MINI features eleven selected species with English/Japanese unique-art slots; overlapping badge binders and HAM10 trophy vault; four compact pack pools; a 1,000credit base pack and tenfold rewards; market-based selling with last-copy badge warnings; immutable HAM7–10 grading; stronger foil everywhere; physical pack foley; spinning reels; five simultaneous Matter physics balls; four-life retryable memory; auto-connected chat/reactions/threaded card trades and the global Offers bell.

Use game2 with mini-lobby, Mini record prefixes and packmini-v1 local saves. Preserve separation from the original game's data. Settings temp save remains locked by code1234. Verify daily free pack claim/hiding, HAM10 celebration, ungraded50% / HAM7 30% / HAM8 70% / HAM9 100% / HAM10 200% sale references, selling last copies removes badges, grading/finishes travel with trades, pending ball reload recovery and both players' matching confirmation before exchange.

Build and load PACK MINI. Report host replacements 5/5, downloads 70/70, replacements 70/70, native compatibility integration, actual build/loading result and live external-server status. Test two independent accounts in the Mini room for chat, badges, threaded offers, notifications and a mutually confirmed graded-card trade.
