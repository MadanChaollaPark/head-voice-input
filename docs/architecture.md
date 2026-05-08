# Architecture

## High-level

```
+--------------------------------------------------------+
|                    Cursor / VS Code                     |
|                                                         |
|   +-------------------+      postMessage              |
|   | Extension host    | <----------------+            |
|   | (Node, dist/      |                  |            |
|   |  extension.js)    |  +---------------v----------+ |
|   |                   |  |  Webview (Chromium)      | |
|   | - commands        |  |  dist/webview.js         | |
|   | - status bar      |  |  dist/webview.css        | |
|   | - editor edits    |  |                          | |
|   | - SecretStorage   |  |  - getUserMedia          | |
|   | - Deepgram WSS    |  |  - MediaPipe Tasks-Vision| |
|   |                   |  |  - MediaRecorder         | |
|   +---------+---------+  +-----+--------------------+ |
|             |                  |                      |
|             | Token            | model fetch           |
|             v                  v                      |
|   wss://api.deepgram.com  storage.googleapis.com      |
+--------------------------------------------------------+
```

## Process boundaries

There are exactly two contexts that matter:

**Extension host** runs in Cursor's Node.js process. It is the only thing that can:
- Register VS Code commands.
- Edit text documents.
- Read and write `SecretStorage`.
- Open arbitrary outbound network connections (Deepgram WebSocket).

**Webview** runs in a sandboxed Chromium process. It is the only thing that can:
- Call `navigator.mediaDevices.getUserMedia`.
- Run wasm modules (MediaPipe runtime).
- Render the panel UI.

Communication between the two is one-way `postMessage` in each direction. Everything ends up in `src/types.ts` so both sides agree on the shape.

## Module map

```
src/
  extension.ts      Activation, command routing, dictation lifecycle, transcript insertion.
  panel.ts          Creates and tracks the singleton webview panel; builds CSP-pinned HTML.
  statusBar.ts      Status bar item with off/tracking/paused/dictating states.
  deepgram.ts       Streaming WebSocket client; opens on dictation start, buffers until OPEN.
  types.ts          HostToWebview / WebviewToHost message unions, HeadInputConfig.
  webview/
    main.ts         Entry; orchestrates camera, tracker, mic, calibration, smile, nudges.
    camera.ts       getUserMedia (video + audio) and friendly error mapping.
    landmarker.ts   MediaPipe FaceLandmarker init + per-frame detection loop.
    pose.ts         Forward-vector yaw/pitch/roll extraction + One-Euro filter.
    smile.ts        mouthSmileLeft + mouthSmileRight average + on/off hysteresis gate.
    calibration.ts  1s neutral-pose averaging; subtracts neutral from each pose.
    nudge.ts        Pose-to-direction events with dead zone, hysteresis, repeat-on-hold.
    mic.ts          MediaRecorder wrapper that streams chunks while active.
    style.css       Panel styling using VS Code theme tokens.
    index.html      Reference only; HTML is produced in panel.ts.
```

## Why these boundaries

- The webview owns sensors so the extension host never needs camera/mic permission.
- The host owns secrets so the API key is never copied into a less trusted context.
- `types.ts` is the single source of truth for both sides; any message-shape mismatch is a TS error in both bundles.

## Lifecycles

- **Extension activation** (`onStartupFinished`): registers commands and the status bar; does not start tracking.
- **Panel open**: webview boots, requests camera + mic, loads MediaPipe, runs auto-calibration. Sends `ready`; host posts initial config.
- **Smile held > `smileOnHoldMs`**: webview emits `dictation: true`; host opens Deepgram WSS, key fetched from `SecretStorage`.
- **Smile released > `smileOffHoldMs`**: webview stops `MediaRecorder`, emits `dictation: false`; host closes WSS.
- **Final transcript**: forwarded to webview for display, inserted at last active editor.

## Data flow

See [`data-flow.md`](data-flow.md) for the full message-by-message walkthrough.

## Build pipeline

`esbuild.mjs` builds two bundles:

| Bundle              | Target           | Format | External  |
| ------------------- | ---------------- | ------ | --------- |
| `dist/extension.js` | `node18`         | `cjs`  | `vscode`  |
| `dist/webview.js`   | `chrome120`      | `iife` | none      |

It also copies the MediaPipe wasm fileset from `node_modules/@mediapipe/tasks-vision/wasm` into `dist/wasm` and the panel CSS into `dist/webview.css`. The HTML is rendered at runtime in `panel.ts` so it can inject `webview.cspSource`, asset URIs, and a per-load nonce.

## Trade-offs we accepted

- **MediaPipe model loaded from CDN.** First open requires network; offline-first would mean shipping the ~3 MB model file with the extension.
- **MediaRecorder webm/opus chunks streamed straight to Deepgram.** Simpler than AudioWorklet PCM, but relies on Deepgram auto-detecting the container. If you need finer control, switch to `?encoding=linear16&sample_rate=16000` and feed raw PCM from an AudioWorklet.
- **Editor-only navigation.** No OS-level mouse control; that would require a native sidecar process.
- **Single panel.** There's a single global panel handle in `panel.ts`; reopening shows the existing one rather than spawning another.
