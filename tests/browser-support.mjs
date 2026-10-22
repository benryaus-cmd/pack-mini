import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export function dependency(name) {
  try {
    return require(name);
  } catch {
    return require(
      require.resolve(name, {
        paths: [
          process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ||
            "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules",
        ],
      }),
    );
  }
}
export const { chromium } = dependency("playwright");
export const launchOptions = {
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-zygote",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
};
