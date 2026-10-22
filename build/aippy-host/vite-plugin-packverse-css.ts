import type { Plugin } from "vite";

const STYLESHEET_SUFFIX = "/src/games/importedGame/upstream/src/styles/app.css";
const ROOT = "#packverse-game-root";

type CssDelimiter = { index: number; value: "{" | ";" } | undefined;

function nextDelimiter(css: string, start: number): CssDelimiter {
  let quote = "";
  let parentheses = 0;
  let brackets = 0;
  for (let index = start; index < css.length; index += 1) {
    const char = css[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end < 0 ? css.length : end + 1;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(") parentheses += 1;
    else if (char === ")") parentheses = Math.max(0, parentheses - 1);
    else if (char === "[") brackets += 1;
    else if (char === "]") brackets = Math.max(0, brackets - 1);
    else if (!parentheses && !brackets && (char === "{" || char === ";")) {
      return { index, value: char };
    }
  }
  return undefined;
}

function matchingBrace(css: string, open: number): number {
  let depth = 1;
  let quote = "";
  for (let index = open + 1; index < css.length; index += 1) {
    const char = css[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end < 0 ? css.length : end + 1;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return index;
  }
  return css.length - 1;
}

function splitSelectors(value: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(") parentheses += 1;
    else if (char === ")") parentheses = Math.max(0, parentheses - 1);
    else if (char === "[") brackets += 1;
    else if (char === "]") brackets = Math.max(0, brackets - 1);
    else if (char === "," && !parentheses && !brackets) {
      selectors.push(value.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(value.slice(start));
  return selectors;
}

function scopeSelector(selector: string): string {
  const value = selector.trim();
  if (!value) return value;
  if (value === "*") return `${ROOT}, ${ROOT} *`;
  let mapped = value.replace(
    /(^|[\s>+~])(?:html|body|:root|#root)(?=$|[\s>+~.:#\[])/gi,
    (_match, leading: string) => `${leading}${ROOT}`,
  );
  let previous = "";
  while (mapped !== previous) {
    previous = mapped;
    mapped = mapped.replace(
      /#packverse-game-root(?:\s+|[>+~]\s*)#packverse-game-root/g,
      ROOT,
    );
  }
  return mapped.includes(ROOT) ? mapped : `${ROOT} ${mapped}`;
}

function scopeRules(css: string, keyframes = false): string {
  let output = "";
  let cursor = 0;
  while (cursor < css.length) {
    const delimiter = nextDelimiter(css, cursor);
    if (!delimiter) {
      output += css.slice(cursor);
      break;
    }
    if (delimiter.value === ";") {
      output += css.slice(cursor, delimiter.index + 1);
      cursor = delimiter.index + 1;
      continue;
    }
    const close = matchingBrace(css, delimiter.index);
    const header = css.slice(cursor, delimiter.index);
    const body = css.slice(delimiter.index + 1, close);
    const trimmed = header.trim();
    if (trimmed.startsWith("@")) {
      const nested =
        /^@(media|supports|container|layer|document|scope|starting-style)\b/i.test(
          trimmed,
        );
      const frame = /^@(?:-webkit-)?keyframes\b/i.test(trimmed);
      const content = nested
        ? scopeRules(body, keyframes)
        : frame
          ? scopeRules(body, true)
          : body;
      output += `${header}{${content}}`;
    } else if (keyframes) {
      output += `${header}{${body}}`;
    } else {
      const leading =
        header.match(/^(?:(?:\s)|(?:\/\*[\s\S]*?\*\/))*/)?.[0] ?? "";
      const selectors = header.slice(leading.length);
      output += `${leading}${splitSelectors(selectors).map(scopeSelector).join(",")}{${body}}`;
    }
    cursor = close + 1;
  }
  return output;
}

export function packverseCssPlugin(): Plugin {
  let base = "/";
  return {
    name: "packverse-host-css-scope",
    enforce: "pre",
    configResolved(config) {
      base = config.base.endsWith("/") ? config.base : `${config.base}/`;
    },
    transform(code, id) {
      const filePath = id.split("?")[0].replace(/\\/g, "/");
      if (
        !filePath.includes("/src/games/importedGame/upstream/src/styles/") ||
        !filePath.endsWith(".css")
      )
        return undefined;
      let scoped = scopeRules(code);
      scoped = scoped.replace(
        /url\(\s*(['"]?)\/fonts\/([^'")]+)\1\s*\)/g,
        (_match, quote: string, name: string) => {
          return `url(${quote}${base}fonts/${name}${quote})`;
        },
      );
      if (!filePath.endsWith(STYLESHEET_SUFFIX))
        return { code: scoped, map: null };
      const hiddenSelectors = [
        `${ROOT} .desktop-brand`,
        `${ROOT} .desktop-detail`,
      ];
      scoped += `\n${ROOT}{display:block;width:100%;height:100%;min-width:0;min-height:0;}\n`;
      scoped += `${ROOT} .desktop-scene{display:flex!important;width:100%;height:100%;min-width:0;min-height:0;visibility:visible!important;opacity:1!important;}\n`;
      scoped += `${ROOT} .game-root{min-width:0;min-height:0;width:min(100%,560px);}\n`;
      scoped += `@media(max-width:640px){${hiddenSelectors.join(",")}{display:none!important;}}\n`;
      return { code: scoped, map: null };
    },
  };
}
