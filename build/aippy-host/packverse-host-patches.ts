import { readFile } from "node:fs/promises";
import path from "node:path";
/** 1.2 includes host callbacks and UUID fallback in canonical source. Validate them without rewriting tested source. */
export async function applyPackverseHostPatches(
  upstreamRoot: string,
): Promise<void> {
  const checks = [
    ["src/App.tsx", "onOpenProjectFiles"],
    ["src/components/Overlays.tsx", "onOpenProjectFiles"],
    ["src/game/uuid.ts", "generateId"],
  ];
  for (const [file, marker] of checks) {
    if (
      !(await readFile(path.join(upstreamRoot, file), "utf8")).includes(marker)
    )
      throw Error(`PACK MINI 1.0 host integration missing in ${file}`);
  }
}
