// Read the exact representative printing, preserving collectible IDs and artwork groups.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
const root = path.resolve(process.argv[2] || "../tcgdex-reference");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (!file.endsWith(".ts")) file += ".ts";
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  cache.set(file, module.exports);
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("require", "module", "exports", js)(
    (name) => load(path.resolve(path.dirname(file), name)),
    module,
    module.exports,
  );
  cache.set(file, module.exports);
  return module.exports;
}
const by = new Map();
for (const folder of ["data", "data-asia"])
  for (const series of fs
    .readdirSync(path.join(root, folder), { withFileTypes: true })
    .filter((f) => f.isDirectory())) {
    const dir = path.join(root, folder, series.name);
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((f) => f.isDirectory())) {
      const setPath = path.join(dir, entry.name + ".ts");
      if (!fs.existsSync(setPath)) continue;
      const set = load(setPath).default;
      by.set(
        (folder === "data" ? "en" : "ja") + ":" + set.id,
        path.join(dir, entry.name),
      );
    }
  }
const cards = JSON.parse(fs.readFileSync("src/game/mini-cards.json"));
let explicit = 0,
  fallback = 0;
const missing = [];
for (const c of cards) {
  const dir = by.get(c.language + ":" + c.setId);
  const file = dir && path.join(dir, c.localId + ".ts");
  if (!file || !fs.existsSync(file)) {
    missing.push(c.id);
    continue;
  }
  const raw = load(file).default;
  const variants = raw.variants ?? raw.set.variants;
  if (Array.isArray(variants)) {
    c.variants = Object.fromEntries(
      ["normal", "holo", "reverse"].map((t) => [
        t,
        variants.some((v) => v.type === t),
      ]),
    );
    explicit++;
  } else if (variants) {
    c.variants = {
      normal: !!variants.normal,
      holo: !!variants.holo,
      reverse: !!variants.reverse,
    };
    explicit++;
  } else {
    // Missing metadata stays conservative: retain the prior holo claim, no invented reverse eligibility.
    c.variants = { normal: !c.holo, holo: c.holo, reverse: false };
    fallback++;
  }
  c.holo = c.variants.holo;
  // Printed rarity, including Promo, is independent of the finish.
  c.rarity = raw.rarity;
}
fs.writeFileSync("src/game/mini-cards.json", JSON.stringify(cards) + "\n");
const report = {
  source: "https://github.com/tcgdex/cards-database",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  cards: cards.length,
  explicit,
  fallback,
  missing,
  separateFinishImages: 0,
  note: "TCGdex supplies a shared scan for each printing. Finish-specific images are not fabricated. Render holo/reverse masks over that exact scan; optional finishImages supports separately verified assets.",
};
fs.writeFileSync(
  "docs/MINI-FINISH-AUDIT.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(report);
