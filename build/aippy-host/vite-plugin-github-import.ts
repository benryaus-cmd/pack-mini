import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { applyPackverseHostPatches } from "./packverse-host-patches";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/benryaus-cmd/pack-mini/main/updates/pack-mini-1.1.3.json";
const IMPORT_VERSION = "pack-mini-1.1.3";
const EXPECTED_FILES = 76;
const REQUIRED_FILES = [
  "package.json",
  "build/aippy-user-compat.ts",
  "src/App.tsx",
  "src/game/catalogue.ts",
  "src/game/mini-cards.json",
  "src/services/useGame.ts",
  "src/styles/app.css",
];
const REQUIRED_DEPENDENCIES = [
  "matter-js",
  "@aippy/runtime",
  "lucide-react",
  "gsap",
  "motion",
  "howler",
  "react",
  "react-dom",
];
const IMPORT_DIRECTORY = "src/games/importedGame";
const CACHE_FILE = ".packmini-import.json";
const HOST_PATCH_VERSION = 2;

type ManifestFile = {
  source: string;
  target: string;
  expectedSize?: number;
  expectedHash?: string;
};

type DownloadRecord = { path: string; size: number; sha256: string };
type ImportSummary = { downloaded: number; promoted: number; cached: boolean };

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Packverse manifest must contain an object.");
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pathValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.path === "string") return record.path;
  if (typeof record.url === "string") return record.url;
  return undefined;
}

function normalizeTarget(value: string): string {
  let target = value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  const hostedPrefix = `${IMPORT_DIRECTORY}/upstream/`;
  if (target.startsWith(hostedPrefix))
    target = target.slice(hostedPrefix.length);
  if (target.startsWith("upstream/")) target = target.slice("upstream/".length);
  const segments = target.split("/");
  if (
    !target ||
    /^[a-z]:/i.test(target) ||
    segments.some((part) => !part || part === ".." || part === ".")
  ) {
    throw new Error(`Unsafe Packverse target path: ${value}`);
  }
  return target;
}

function parseManifest(raw: string): { baseUrl: URL; files: ManifestFile[] } {
  const document = asRecord(JSON.parse(raw) as unknown);
  const version = document.version ?? document.release;
  if (version && ![IMPORT_VERSION, "1.1.3"].includes(String(version))) {
    throw new Error(
      `Unexpected Packverse manifest version: ${String(version)}`,
    );
  }
  if (document.mode && document.mode !== "full-snapshot") {
    throw new Error(`Packverse manifest mode must be full-snapshot.`);
  }
  if (typeof document.baseUrl !== "string") {
    throw new Error("Packverse manifest is missing its baseUrl.");
  }
  const baseUrl = new URL(document.baseUrl);
  if (baseUrl.protocol !== "https:")
    throw new Error("Packverse baseUrl must use HTTPS.");
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  const rawFiles = document.files ?? document.entries ?? document.assets;
  let rows: unknown[];
  if (Array.isArray(rawFiles)) {
    rows = rawFiles;
  } else if (rawFiles && typeof rawFiles === "object") {
    rows = Object.entries(rawFiles as Record<string, unknown>).map(
      ([source, value]) => {
        if (typeof value === "string") return { source, target: value };
        return {
          ...asRecord(value),
          source: pathValue(asRecord(value).source) ?? source,
        };
      },
    );
  } else {
    throw new Error("Packverse manifest is missing its files list.");
  }
  const files = rows.map((value): ManifestFile => {
    const row = asRecord(value);
    const source =
      pathValue(row.source) ?? pathValue(row.sourcePath) ?? pathValue(row.path);
    const target =
      pathValue(row.target) ??
      pathValue(row.targetPath) ??
      pathValue(row.destination) ??
      pathValue(row.path) ??
      source;
    if (!source || !target)
      throw new Error(
        "Each Packverse manifest file needs source and target paths.",
      );
    const sizeValue = Number(row.size ?? row.bytes);
    const expectedSize =
      Number.isFinite(sizeValue) && sizeValue >= 0 ? sizeValue : undefined;
    const hash = row.sha256 ?? row.hash;
    return {
      source,
      target: normalizeTarget(target),
      expectedSize,
      expectedHash:
        typeof hash === "string"
          ? hash.replace(/^sha256:/i, "").toLowerCase()
          : undefined,
    };
  });
  if (files.length !== EXPECTED_FILES) {
    throw new Error(
      `Packverse manifest lists ${files.length}/${EXPECTED_FILES} files.`,
    );
  }
  const targets = new Set(files.map((file) => file.target));
  if (targets.size !== files.length)
    throw new Error("Packverse manifest contains duplicate target paths.");
  const missing = REQUIRED_FILES.filter((required) => !targets.has(required));
  if (missing.length)
    throw new Error(
      `Packverse manifest is missing required files: ${missing.join(", ")}`,
    );
  return { baseUrl, files };
}

function sourceUrl(baseUrl: URL, source: string): URL {
  const normalizedBase = new URL(
    baseUrl.href.endsWith("/") ? baseUrl.href : `${baseUrl.href}/`,
  );
  const value = /^https:\/\//i.test(source)
    ? source
    : source.replace(/^\/+/, "");
  const url = new URL(value, normalizedBase);
  if (
    url.protocol !== "https:" ||
    url.origin !== normalizedBase.origin ||
    !url.pathname.startsWith(normalizedBase.pathname)
  ) {
    throw new Error(
      `Packverse source must remain under the manifest baseUrl: ${source}`,
    );
  }
  return url;
}

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastFailure = "unknown network error";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (attempt < 2)
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1)),
        );
    }
  }
  throw new Error(`${label} failed after retries: ${lastFailure}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function manifestDigest(raw: string): string {
  return sha256(Buffer.from(raw, "utf8"));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function verifyDependencies(
  projectRoot: string,
  upstream: string,
): Promise<void> {
  const hostPackage = asRecord(
    JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as unknown,
  );
  const upstreamPackage = asRecord(
    JSON.parse(
      await readFile(path.join(upstream, "package.json"), "utf8"),
    ) as unknown,
  );
  const hostDependencies = optionalRecord(hostPackage.dependencies);
  const hostDevDependencies = optionalRecord(hostPackage.devDependencies);
  const upstreamDependencies = {
    ...optionalRecord(upstreamPackage.dependencies),
    ...optionalRecord(upstreamPackage.peerDependencies),
    ...optionalRecord(upstreamPackage.devDependencies),
  };
  const missingHost = REQUIRED_DEPENDENCIES.filter(
    (name) => !hostDependencies[name],
  );
  if (!hostDevDependencies["@types/howler"]) missingHost.push("@types/howler");
  if (missingHost.length)
    throw new Error(
      `Host dependencies are not merged: ${missingHost.join(", ")}`,
    );
  const hostAvailable = { ...hostDependencies, ...hostDevDependencies };
  const missingUpstream = REQUIRED_DEPENDENCIES.filter(
    (name) => !upstreamDependencies[name],
  );
  const unmerged = Object.keys(
    optionalRecord(upstreamPackage.dependencies),
  ).filter((name) => !hostAvailable[name]);
  if (missingUpstream.length || unmerged.length) {
    throw new Error(
      `Upstream dependencies need to be merged: ${[...missingUpstream, ...unmerged].join(", ")}`,
    );
  }
  for (const name of ["react", "react-dom"]) {
    const hostMajor = String(hostDependencies[name]).match(/\d+/)?.[0];
    const upstreamMajor = String(upstreamDependencies[name]).match(/\d+/)?.[0];
    if (hostMajor && upstreamMajor && hostMajor !== upstreamMajor) {
      throw new Error(
        `Packverse ${name} major version does not match the host's shared installation.`,
      );
    }
  }
}

async function validCachedSnapshot(
  cachePath: string,
  upstream: string,
  digest: string,
  files: ManifestFile[],
): Promise<boolean> {
  try {
    const cache = asRecord(
      JSON.parse(await readFile(cachePath, "utf8")) as unknown,
    );
    if (cache.version !== IMPORT_VERSION || cache.manifestSha256 !== digest)
      return false;
    const records = cache.files as DownloadRecord[];
    if (!Array.isArray(records) || records.length !== EXPECTED_FILES)
      return false;
    const byPath = new Map(records.map((record) => [record.path, record]));
    for (const file of files) {
      const record = byPath.get(file.target);
      if (!record) return false;
      const bytes = await readFile(path.join(upstream, file.target));
      if (bytes.length !== record.size || sha256(bytes) !== record.sha256)
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function collectSnapshotRecords(
  upstream: string,
  files: ManifestFile[],
): Promise<DownloadRecord[]> {
  const records = await Promise.all(
    files.map(async (file) => {
      const bytes = await readFile(path.join(upstream, file.target));
      return { path: file.target, size: bytes.length, sha256: sha256(bytes) };
    }),
  );
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

async function verifySnapshot(
  upstream: string,
  records: DownloadRecord[],
): Promise<void> {
  if (records.length !== EXPECTED_FILES)
    throw new Error("Packverse promotion count is incomplete.");
  for (const record of records) {
    const bytes = await readFile(path.join(upstream, record.path));
    if (bytes.length !== record.size || sha256(bytes) !== record.sha256) {
      throw new Error(
        `Packverse promotion validation failed for ${record.path}.`,
      );
    }
  }
}

async function syncPublicDirectory(
  source: string,
  destination: string,
): Promise<{ files: number; webp: number; woff2: number }> {
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(destination, { recursive: true });
  const counts = { files: 0, webp: 0, woff2: 0 };
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      const nested = await syncPublicDirectory(from, to);
      counts.files += nested.files;
      counts.webp += nested.webp;
      counts.woff2 += nested.woff2;
    } else if (entry.isFile()) {
      await copyFile(from, to);
      counts.files += 1;
      const extension = path.extname(entry.name).toLowerCase();
      if (extension === ".webp") counts.webp += 1;
      if (extension === ".woff2") counts.woff2 += 1;
    } else {
      throw new Error(`Unexpected non-file entry in Packverse assets: ${from}`);
    }
  }
  return counts;
}

async function syncGameAssets(
  projectRoot: string,
  upstream: string,
): Promise<void> {
  const publicRoot = path.join(projectRoot, "public");
  const fonts = await syncPublicDirectory(
    path.join(upstream, "public/fonts"),
    path.join(publicRoot, "fonts"),
  );
  if (!fonts.woff2) throw new Error("PACK MINI font assets are incomplete.");
}

async function downloadSnapshot(
  projectRoot: string,
  baseUrl: URL,
  files: ManifestFile[],
): Promise<DownloadRecord[]> {
  const importRoot = path.join(projectRoot, IMPORT_DIRECTORY);
  const staging = path.join(importRoot, ".packverse-staging");
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const records: DownloadRecord[] = [];
  const failures: string[] = [];
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < files.length) {
      const file = files[cursor];
      cursor += 1;
      try {
        const url = sourceUrl(baseUrl, file.source);
        const response = await fetchWithRetry(url.href, file.target);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (
          file.expectedSize !== undefined &&
          bytes.length !== file.expectedSize
        ) {
          throw new Error(
            `size ${bytes.length} did not match ${file.expectedSize}`,
          );
        }
        const digest = sha256(bytes);
        if (
          file.expectedHash &&
          /^[a-f0-9]{64}$/.test(file.expectedHash) &&
          digest !== file.expectedHash
        ) {
          throw new Error("SHA-256 checksum did not match the manifest");
        }
        const output = path.join(staging, file.target);
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, bytes);
        records.push({ path: file.target, size: bytes.length, sha256: digest });
      } catch (error) {
        failures.push(
          `${file.target}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(8, files.length) }, () => worker()),
    );
    if (failures.length)
      throw new Error(
        `Packverse downloads failed (${failures.length}): ${failures.slice(0, 5).join("; ")}`,
      );
    records.sort((a, b) => a.path.localeCompare(b.path));
    if (records.length !== EXPECTED_FILES)
      throw new Error(`Downloaded ${records.length}/${EXPECTED_FILES} files.`);
    await verifySnapshot(staging, records);
    await applyPackverseHostPatches(staging);
    records.splice(
      0,
      records.length,
      ...(await collectSnapshotRecords(staging, files)),
    );
    await verifySnapshot(staging, records);
    const backup = path.join(importRoot, ".packverse-backup");
    const upstream = path.join(importRoot, "upstream");
    await rm(backup, { recursive: true, force: true });
    const hadPrevious = await pathExists(upstream);
    if (hadPrevious) await rename(upstream, backup);
    try {
      await rename(staging, upstream);
    } catch (error) {
      if (hadPrevious) await rename(backup, upstream);
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
    await verifySnapshot(upstream, records);
    return records;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

let importPromise: Promise<ImportSummary> | undefined;

export function ensurePackverseImported(): Promise<ImportSummary> {
  if (!importPromise) importPromise = performImport();
  return importPromise;
}

async function performImport(): Promise<ImportSummary> {
  const projectRoot = process.cwd();
  const response = await fetchWithRetry(MANIFEST_URL, "Packverse manifest");
  const raw = await response.text();
  const digest = manifestDigest(raw);
  const manifest = parseManifest(raw);
  const importRoot = path.join(projectRoot, IMPORT_DIRECTORY);
  const upstream = path.join(importRoot, "upstream");
  const cachePath = path.join(importRoot, CACHE_FILE);
  await mkdir(importRoot, { recursive: true });
  let downloaded = 0;
  let records: DownloadRecord[];
  if (await validCachedSnapshot(cachePath, upstream, digest, manifest.files)) {
    const cache = asRecord(
      JSON.parse(await readFile(cachePath, "utf8")) as unknown,
    );
    records = cache.files as DownloadRecord[];
  } else {
    records = await downloadSnapshot(
      projectRoot,
      manifest.baseUrl,
      manifest.files,
    );
    downloaded = records.length;
  }
  await applyPackverseHostPatches(upstream);
  records = await collectSnapshotRecords(upstream, manifest.files);
  await verifySnapshot(upstream, records);
  await writeFile(
    `${cachePath}.tmp`,
    JSON.stringify(
      {
        version: IMPORT_VERSION,
        hostPatchVersion: HOST_PATCH_VERSION,
        manifestUrl: MANIFEST_URL,
        manifestSha256: digest,
        files: records,
      },
      null,
      2,
    ),
  );
  await rename(`${cachePath}.tmp`, cachePath);
  await verifyDependencies(projectRoot, upstream);
  await syncGameAssets(projectRoot, upstream);
  console.log(
    `[Aippy] Packverse ${IMPORT_VERSION}: downloaded ${downloaded}, promoted ${records.length}/${EXPECTED_FILES} files.`,
  );
  return { downloaded, promoted: records.length, cached: downloaded === 0 };
}

export function githubGameImportPlugin(): Plugin {
  return {
    name: "packverse-github-import",
    enforce: "pre",
    async config() {
      await ensurePackverseImported();
    },
  };
}
