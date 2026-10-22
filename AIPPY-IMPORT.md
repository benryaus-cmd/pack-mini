# Aippy PACK MINI import

Create a separate PACK MINI Aippy project using the current PACKVERSE host as its starting copy. Use [the import prompt](updates/AIPPY-PROMPT-MINI-1.0.md) and the commit-pinned `updates/pack-mini-1.0.0.json` manifest.

The host's `src/App.tsx` owns one root/loading boundary and the code-1234 temp-save file viewer. `src/games/importedGame/ImportedGame.tsx` renders only `./upstream/src/App.tsx`; its new Mini adapter removes automatic host theme music so PopTron remains opt-in. Existing SDK and Vite single-file plugins remain in place. Add `matter-js` to host dependencies.

First download the manifest's five `hostFiles` with Node fetch during build preparation, before Vite reads its config. Then the normal Vite importer downloads and validates every `files` entry from `baseUrl + source`, stages, and promotes them into `src/games/importedGame/upstream/` using relative targets. Preserve all download bytes. The updated CSS plugin scopes all game stylesheets. Public sync copies fonts; card pictures stay on TCGdex.

Use game2 and mini-lobby. Mini saves/settings, social/showcase/trading records and collection leaderboard have their own namespaces. The source Pack-Opener/Aippy game can remain available as a separate project. The manifest's entry is upstream/src/App.tsx as rendered by the adapter; standalone main.tsx is a separate web bootstrap.

Verify visible game, four packs, daily claim/reload, HAM grading and sale factors, badge loss warning, five-ball recovery, four-life retry, chat/current Aippy profile, and a two-player confirmed trade. Test Settings → temp save →1234. Report exact file download/replacement counts and actual build/loading result.
