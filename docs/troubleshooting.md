# Troubleshooting

A loose collection of "this didn't work, what now" answers. Symptoms first, root causes second.

## Panel opens but the video preview is black

The camera initialized but no frames are arriving. Likely causes:

- Another app is holding the camera. Quit Zoom, Photo Booth, browser tabs, etc.
- A virtual camera (OBS, Snap Camera) is selected as the default device. The webview picks the OS default; switch your default to a real device.
- macOS only: the kernel extension that mediates camera access can wedge after sleep. `sudo killall VDCAssistant && sudo killall AppleCameraAssistant`.

## Panel says "Calibrating..." forever

The face landmarker never produced a result with a non-empty `facialTransformationMatrixes`. Check:

- The webview devtools console for wasm load errors. If `vision_wasm_internal.wasm` 404s, the esbuild copy step didn't run; rerun `npm run build`.
- Lighting on your face. The model needs at least one well-lit, front-facing detection to seed calibration.
- The model URL fetched from `storage.googleapis.com`. If your network blocks that, vendor the `face_landmarker.task` file locally and update `landmarker.ts` to load from `webview.asWebviewUri`.

## Cursor moves but in the wrong direction

Sign convention disagrees with your camera mounting. Open `src/webview/nudge.ts:evalAxis` and flip the sign of the offending axis. Or, equivalently, multiply the input by `-1` in `src/webview/main.ts` before calling `controller.update`.

## Cursor moves too fast / too slow on hold

Two settings interact:
- `headInput.repeatRateHz` controls the rate while held.
- `headInput.deadZoneDegrees` controls how far past neutral counts as "actively tilting".

Common tunings:
- "Walk one line at a time": `repeatRateHz: 2`, `deadZoneDegrees: 10`.
- "Skim quickly": `repeatRateHz: 12`, `deadZoneDegrees: 6`, `verticalAction: scroll`.

## Smile triggers when I'm not smiling

Your neutral face has higher `mouthSmileLeft`/`mouthSmileRight` blendshape values than the default threshold. Raise `headInput.smileOnThreshold`. Also consider raising `smileOnHoldMs` to require an intentional smile.

## Smile does *not* trigger when I am smiling

Inverse problem: your full smile falls under the threshold. Lower `smileOnThreshold` (try `0.4`) and / or lower `smileOnHoldMs` (try `100`).

You can confirm what the model thinks of your smile by enabling the pose debug overlay (TODO: not yet wired; for now, log `smileFromResult` in `webview/main.ts`).

## Dictation starts but no transcripts appear

Walk the data flow:

1. Webview devtools console — is `audio` being sent? Check that `MicRecorder` is active while the smile gate is on.
2. Extension Development Host debug console — is `ElevenLabsSttClient.sendAudio` being called?
3. Network tab in webview devtools — webviews don't show extension-host fetches. Instead check the host's `console.error` for socket errors.
4. If the socket connects but transcripts never arrive, see [elevenlabs.md#audio-format](./elevenlabs.md#audio-format) — Scribe expects mono 16 kHz PCM16 chunks with the current configuration.

## "Failed to set up dictation" toast

The host couldn't open the WebSocket. Most common cause is a missing or invalid API key. Run `Head Input: Clear ElevenLabs API Key` followed by `Head Input: Set ElevenLabs API Key` and paste a fresh key.

If the key is correct, check `console.error` in the Debug Console; the socket close code (`4001` = auth, `4008` = rate, `1011` = server) is logged.

## Build fails: cannot find module '@mediapipe/tasks-vision'

You ran `npm install` outside the project directory or `node_modules` is corrupt. Delete `node_modules` and `package-lock.json`, then re-run `npm install` and `npm run build`.

## Build fails: TS1479 / ESM-only module

`tsconfig.json` reverted from `module: "ESNext"` to `module: "Node16"`. The Tasks-Vision package is ESM-only and esbuild handles it, but tsc needs the ESNext + Bundler combo. Restore the config from this repo.

## Webview content blocked by CSP

You added an inline `<script>` or pulled an asset from a host that isn't in `panel.ts`'s CSP whitelist. The current allow-list is:

- `script-src` — same origin + nonce + `'wasm-unsafe-eval'`
- `connect-src` — `https://storage.googleapis.com` (model file). ElevenLabs STT runs in the extension host, not the webview.

If you need another origin, add it to `connect-src` (or `img-src`, etc.) and rebuild.

## Extension not appearing in Cursor

Cursor is a VS Code fork but uses a different extension marketplace. To sideload during development:

1. `npx @vscode/vsce package` produces `head-voice-input-0.0.1.vsix`.
2. `cursor --install-extension head-voice-input-0.0.1.vsix`.
3. Reload Cursor (`Cmd/Ctrl+Shift+P -> Developer: Reload Window`).
4. Run `Head Input: Open Panel` from the command palette.

If the command isn't found, check the `engines.vscode` field in `package.json`. Cursor advertises a recent VS Code engine; if you set `^1.99.0` and Cursor is older, the extension won't activate.
