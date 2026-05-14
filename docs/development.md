# Development

## Prerequisites

- Node.js 18 or later (project tested on 20 and 25).
- An ElevenLabs API key for end-to-end dictation testing.
- A working webcam and microphone.

## First-time setup

```bash
git clone https://github.com/MadanChaollaPark/head-voice-input.git
cd head-voice-input
npm install
npm run build
```

`npm install` pulls `@mediapipe/tasks-vision` (about 2 MB of wasm) and `ws`. The build copies the wasm fileset into `dist/wasm/` so the webview can load it through `webview.asWebviewUri`.

## Iteration loop

There are two ways to iterate.

### Watch mode

```bash
npm run watch
```

esbuild rebuilds `dist/extension.js` and `dist/webview.js` on file change. In a separate Cursor / VS Code window press `F5` to launch the Extension Development Host, then `Cmd/Ctrl+R` to reload after changes.

### One-shot

```bash
npm run build
```

Useful before committing or pushing.

### Type checking

```bash
npm run typecheck
```

Runs `tsc --noEmit`. The project uses `module: "ESNext"` + `moduleResolution: "Bundler"` so ESM-only deps like `@mediapipe/tasks-vision` resolve cleanly.

## Running the extension

1. Open the project folder in Cursor / VS Code.
2. Press `F5` (or run "Debug: Start Debugging").
3. A new "Extension Development Host" window opens with the extension loaded.
4. Run `Head Input: Open Panel` from the command palette.
5. Grant camera and microphone permission when prompted.

If you don't see the panel, check the Debug Console in the *original* window for activation errors.

## Debugging

### Extension host

The Debug Console in the originating window receives all host-side `console.log` output and exception traces. Set breakpoints directly in `src/extension.ts`, `src/panel.ts`, etc.

### Webview

Open the webview's developer tools by right-clicking inside the panel and choosing "Open Webview Developer Tools" (some Cursor builds expose this via the command palette as `Developer: Open Webview Developer Tools`). All `console.log` from `src/webview/*.ts` lands there.

Note that source maps are emitted in non-production builds, so breakpoints land on the original `.ts` lines.

## Project conventions

- Two-space indentation, LF line endings, UTF-8. Enforced via `.editorconfig`.
- Strict TypeScript: no implicit any, no unused locals, no implicit returns.
- Conventional-commit prefixes: `feat`, `fix`, `chore`, `docs`, `build`, `deps`, `refactor`. Optional scope like `feat(webview): ...`.

## Common pitfalls

- **`detectForVideo` requires monotonic timestamps.** `landmarker.ts` clamps duplicates by adding 1 ms; if you change the loop, keep that invariant.
- **Webview CSP is strict.** All scripts run under a per-load nonce. Don't add inline `<script>` blocks without using the same nonce that `panel.ts` injects.
- **MediaPipe wasm files must be co-located.** If you change `esbuild.mjs` make sure the `node_modules/@mediapipe/tasks-vision/wasm` copy step still runs; without it the webview can't initialize the task runtime.
- **ElevenLabs expects PCM16.** Keep `mic.ts` emitting mono 16 kHz little-endian PCM chunks; sending browser-native webm/opus blobs will not match the current Scribe realtime configuration.
- **VS Code's `vscode.workspace.getConfiguration` snapshots at the time you read it.** When configs change, the extension picks them up via `onDidChangeConfiguration` and re-pushes a `config` message to the webview.

## Producing a `.vsix`

```bash
npx @vscode/vsce package
```

This honors `.vscodeignore` and produces a `head-voice-input-0.0.1.vsix`. You can install it locally with:

```bash
code --install-extension head-voice-input-0.0.1.vsix
# or, in Cursor:
cursor --install-extension head-voice-input-0.0.1.vsix
```
