import * as esbuild from "esbuild";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const root = resolve(".");
const dist = resolve("dist");

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const name of await readdir(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    const st = await stat(s);
    if (st.isDirectory()) {
      await copyDir(s, d);
    } else {
      await copyFile(s, d);
    }
  }
}

async function copyAssets() {
  await mkdir(dist, { recursive: true });

  // MediaPipe wasm files
  const wasmSrc = resolve("node_modules/@mediapipe/tasks-vision/wasm");
  if (existsSync(wasmSrc)) {
    await copyDir(wasmSrc, join(dist, "wasm"));
  } else {
    console.warn("[build] mediapipe wasm dir not found; run npm install first");
  }

  // Webview static files
  await copyFile("src/webview/index.html", join(dist, "webview.html"));
  await copyFile("src/webview/style.css", join(dist, "webview.css"));
}

const sharedOpts = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

const extensionBuild = {
  ...sharedOpts,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
};

const webviewBuild = {
  ...sharedOpts,
  entryPoints: ["src/webview/main.ts"],
  outfile: "dist/webview.js",
  platform: "browser",
  target: "chrome120",
  format: "iife",
};

async function run() {
  await copyAssets();
  if (watch) {
    const ext = await esbuild.context(extensionBuild);
    const wv = await esbuild.context(webviewBuild);
    await Promise.all([ext.watch(), wv.watch()]);
    console.log("[build] watching...");
  } else {
    await Promise.all([
      esbuild.build(extensionBuild),
      esbuild.build(webviewBuild),
    ]);
    console.log("[build] done");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
