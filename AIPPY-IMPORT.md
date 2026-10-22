# Update the current PACK MINI Aippy project

Use [the 1.1.4 update prompt](updates/AIPPY-PROMPT-MINI-1.1.4.md). The release manifest is `updates/pack-mini-1.1.4.json`: five host files and 77 upstream files, full-snapshot replacement with exact SHA-256/byte validation.

Prepare host replacements before Vite reads its config; then run the existing importer. Keep the current host's native SDK compatibility, file viewer, CSS scoping, single root, saved progress, game2 and mini-lobby. Use the prompt's immutable manifest URL and its source-commit baseUrl; the old1.0 manifest remains an archive.

The runtime chain remains `src/main.tsx` → host `src/App.tsx` → `src/games/importedGame/ImportedGame.tsx` → `upstream/src/App.tsx`.

`npm run import:manifest -- <source-commit>` builds the hash manifest from an exact committed source snapshot. Commit/push the source first, then publish its manifest and pin that manifest commit in the handover. Source-level validation is recorded in [the 1.1.4 verification report](docs/MINI-1.1.4-VERIFICATION.md).
