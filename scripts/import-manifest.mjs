import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createHash } from "node:crypto";
const sha =
  process.argv[2] ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("Use an exact committed SHA");
const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", sha], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(
    (p) =>
      /^(src\/|build\/|public\/)/.test(p) ||
      [
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "tsconfig.json",
        "index.html",
        "README.md",
        "AIPPY-IMPORT.md",
        "ASSET-CREDITS.md",
      ].includes(p),
  );
const files = paths.map((path) => {
  const content = execFileSync("git", ["show", `${sha}:${path}`], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    source: path,
    target: path,
    encoding: /\.(webp|woff2|mp3|wav|png|jpg)$/.test(path) ? "binary" : "utf-8",
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
});
const packageVersion = JSON.parse(
  execFileSync("git", ["show", `${sha}:package.json`], { encoding: "utf8" }),
).version;
const release = "pack-mini-" + packageVersion;
const manifest = {
  version: release,
  mode: "full-snapshot",
  sourceCommit: sha,
  baseUrl: `https://raw.githubusercontent.com/benryaus-cmd/pack-mini/${sha}/`,
  entry: "src/App.tsx",
  gameSlot: "game2",
  files,
  hostFiles: [
    [
      "build/aippy-host/vite-plugin-github-import.ts",
      "vite-plugin-github-import.ts",
    ],
    ["build/aippy-host/packverse-host-patches.ts", "packverse-host-patches.ts"],
    [
      "build/aippy-host/vite-plugin-packverse-css.ts",
      "vite-plugin-packverse-css.ts",
    ],
    ["build/aippy-host/App.tsx.txt", "src/App.tsx"],
    [
      "build/aippy-host/ImportedGame.tsx.txt",
      "src/games/importedGame/ImportedGame.tsx",
    ],
  ].map(([source, target]) => ({
    ...files.find((f) => f.source === source),
    source,
    target,
  })),
};
fs.mkdirSync("updates", { recursive: true });
fs.writeFileSync(
  `updates/${release}.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Pinned ${files.length} files (${files.reduce((n, f) => n + f.bytes, 0)} bytes) to ${sha}`,
);
