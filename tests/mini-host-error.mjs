import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer, transformWithEsbuild } from "vite";
import { chromium, launchOptions } from "./browser-support.mjs";
const source = fs.readFileSync("build/aippy-host/App.tsx.txt", "utf8");
const modules = {
  "@/config/tweaksConfig.json": "export default {};",
  "@aippy/runtime/tweaks":
    'export function aippyTweaks(){return new Proxy({}, {get:()=>({useState:()=>"#111b2c"})});}',
  "@/gameHost/clipboard":
    "export async function copyText(){window.errorCopied=true;}",
  "@/components/ProjectFileViewer": `import React from 'react';export default function Viewer(p){return React.createElement('div',null,'PRIVATE VIEWER',React.createElement('button',{onClick:p.onBack},'Close viewer'));}`,
  "@/games/importedGame/ImportedGame": `import React from 'react';export default function Game(p){React.useEffect(()=>p.onGameReady?.(),[]);if(window.crashGame)throw Error('Fixture render failure');return React.createElement('div',{id:'packverse-game-root'},React.createElement('div',{className:'desktop-scene'},React.createElement('div',{className:'game-root'},React.createElement('button',{onClick:p.onOpenProjectFiles},'temp save'))));}`,
  "@/components/GameLoadBoundary": `import React from 'react';export function GameFailurePanel(p){return React.createElement('div',null,p.failure.message,React.createElement('button',{onClick:p.onOpenProjectFiles},'PROJECT FILES'),React.createElement('button',{onClick:p.onRetry},'TRY AGAIN'));}export class GameLoadBoundary extends React.Component{state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(e){this.props.onFailure({message:e.message});}render(){return this.state.failed?React.createElement(GameFailurePanel,this.props):this.props.children;}}`,
};
const app = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-host-fixture",
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime"] },
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "host-error-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id === "/host-source.tsx") return "\0host-source";
        if (modules[id]) return "\0fixture:" + id + ".js";
      },
      async load(id) {
        if (id === "\0host-source")
          return (
            await transformWithEsbuild(source, "host-source.tsx", {
              loader: "tsx",
              jsx: "automatic",
            })
          ).code;
        if (id.startsWith("\0fixture:")) return modules[id.slice(9, -3)];
      },
    },
  ],
});
await app.listen();
const browser = await chromium.launch(launchOptions);
try {
  const p = await browser.newPage();
  await p.route("**/host-error.html", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><style>html,body,#root,.packverse-app,.packverse-game-mount,#packverse-game-root,.desktop-scene,.game-root{height:100%;width:100%;margin:0}</style></head><body><div id="root"></div></body></html>',
    }),
  );
  await p.goto(
    `http://127.0.0.1:${app.httpServer.address().port}/host-error.html`,
  );
  await p.evaluate(async () => {
    const React = (
      await import("/node_modules/.vite-host-fixture/deps/react.js")
    ).default;
    const dom =
      await import("/node_modules/.vite-host-fixture/deps/react-dom_client.js");
    const App = (await import("/host-source.tsx")).default;
    (dom.createRoot ?? dom.default.createRoot)(
      document.getElementById("root"),
    ).render(React.createElement(App));
  });
  await p.getByRole("button", { name: "temp save", exact: true }).waitFor();
  await p.evaluate(() =>
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Script error.",
        lineno: 0,
        colno: 0,
      }),
    ),
  );
  await p.getByRole("button", { name: "TRY AGAIN", exact: true }).waitFor();
  assert.equal(
    await p.getByRole("button", { name: /PROJECT FILES/i }).count(),
    0,
    "public startup failure must not expose project files",
  );
  await p.getByRole("button", { name: "COPY ERROR", exact: true }).click();
  assert(await p.evaluate(() => window.errorCopied));
  await p.getByRole("button", { name: "TRY AGAIN", exact: true }).click();
  await p.getByRole("button", { name: "temp save", exact: true }).waitFor();
  await p.evaluate(() => {
    window.crashGame = true;
    window.dispatchEvent(
      new ErrorEvent("error", { message: "Restart fixture" }),
    );
  });
  await p.getByRole("button", { name: "TRY AGAIN", exact: true }).click();
  await p
    .getByText("Fixture render failure", { exact: false })
    .first()
    .waitFor();
  assert.equal(
    await p.getByRole("button", { name: /PROJECT FILES/i }).count(),
    0,
    "React render failure must use the same public-safe panel",
  );
  await p.evaluate(() => (window.crashGame = false));
  await p.getByRole("button", { name: "TRY AGAIN", exact: true }).click();
  await p.getByRole("button", { name: "temp save", exact: true }).click();
  await p.getByLabel("temp save code").fill("1234");
  await p.getByRole("button", { name: "Unlock", exact: true }).click();
  await p.getByText("PRIVATE VIEWER", { exact: false }).waitFor();
  await p.getByRole("button", { name: "Close viewer" }).click();
  await p.getByRole("button", { name: "temp save", exact: true }).waitFor();
  console.log(
    "PASS: global startup and React errors expose only copy/retry; retry recovers; private Settings callback and code1234 viewer remain working",
  );
} finally {
  await browser.close();
  await app.close();
}
