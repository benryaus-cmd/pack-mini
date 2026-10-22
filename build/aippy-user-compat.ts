import type { Plugin } from "vite";
/** Vite 6's dynamic-import destructuring optimizer incorrectly moves the SDK's
 * await destructure across .then(module => module.b), dropping the namespace.
 * Parenthesize the awaited expression so the namespace unwrap runs first.
 * Keep the SDK itself and all native/iframe identity handling unchanged.
 */
export function aippyUserCompat(): Plugin {
  return {
    name: "uff-aippy-user-compat",
    enforce: "pre",
    apply: "build",
    transform(source, id) {
      if (!id.replaceAll("\\", "/").includes("/@aippy/runtime/dist/hooks-"))
        return;
      const code = source.replace(
        /await (import\("\.\/bridge-[^"]+\.js"\)\.then\(\((\w+)\) => \2\.b\))/g,
        "await ($1)",
      );
      return code === source ? undefined : { code, map: null };
    },
  };
}
