# Head + Voice Input

A Cursor / VS Code extension that lets you control the editor with your head, voice, and whistle.

- **Tilt your head** to move the text cursor (or scroll) in the active editor.
- **Smile and hold** to start dictating; speech is transcribed by Deepgram and inserted at the cursor.
- **Stop smiling** to end dictation.
- **Whistle** at one of four pitch bands to nudge the cursor up / down / left / right.
- **Dab** to insert a newline (Enter) at the cursor.

Everything runs locally except the speech-to-text streaming, which uses Deepgram.

## How it works

A webview panel owns the camera and microphone. MediaPipe FaceLandmarker runs in the panel at ~30 fps and reports head pose plus mouth-smile blendshape values. The extension host receives messages from the panel and either runs cursor-movement commands or streams audio to Deepgram and inserts the resulting text.

## Install (development build)

This extension is not yet published. To run it locally:

```bash
git clone https://github.com/MadanChaollaPark/head-voice-input.git
cd head-voice-input
npm install
npm run build
```

Then in Cursor / VS Code:

1. Open the cloned folder.
2. Press `F5` to launch an Extension Development Host.
3. In the new window, run `Head Input: Open Panel` from the command palette.
4. Grant camera and microphone permission when prompted.

## Deepgram API key

Voice dictation uses Deepgram streaming. You will need a key from <https://console.deepgram.com>.

Set it once with the command palette:

- `Head Input: Set Deepgram API Key`

The key is stored in Cursor's secret storage, not in `settings.json`.

## Gestures

| Gesture                       | Action                                           |
| ----------------------------- | ------------------------------------------------ |
| Tilt head up / down           | Move cursor up / down (or scroll, see settings) |
| Tilt head left / right        | Move cursor left / right (or by word)           |
| Hold tilt                     | Repeat the move at `repeatRateHz`                |
| Smile (held > `smileOnHoldMs`) | Start dictation                                  |
| Stop smiling (held > `smileOffHoldMs`) | End dictation                            |
| Whistle (held > `whistleHoldMs`) | Move cursor up / down / left / right depending on pitch |
| Dab (held > `dabHoldMs`)      | Insert a newline (Enter) at the caret           |

Calibration runs automatically when the panel opens. Hold a neutral pose for ~1 second. Recalibrate any time with `Head Input: Recalibrate Neutral Pose` or the panel button.

## Default keybindings

- `Cmd+Shift+H` (`Ctrl+Shift+H` on Windows/Linux) — open the input panel.
- `Cmd+Shift+R` (`Ctrl+Shift+R` on Windows/Linux) — recalibrate (only when the panel is open).

## Settings

All settings live under `headInput.*` in `settings.json`.

| Setting                       | Default | Notes                                                            |
| ----------------------------- | ------- | ---------------------------------------------------------------- |
| `tiltSensitivity`             | `1.0`   | Multiplier on detected tilt. Higher = smaller motions trigger.   |
| `deadZoneDegrees`             | `8`     | Tilt below this is ignored.                                      |
| `repeatRateHz`                | `4`     | Repeats per second while a tilt is held.                         |
| `verticalAction`              | `cursor`| `cursor` moves caret line-by-line, `scroll` scrolls the editor.  |
| `horizontalAction`            | `cursor`| `cursor` moves char-by-char, `word` moves word-by-word.          |
| `smileOnThreshold`            | `0.5`   | Mouth-smile blendshape value above which dictation may start.    |
| `smileOffThreshold`           | `0.3`   | Below this for `smileOffHoldMs` ends dictation.                  |
| `smileOnHoldMs`               | `200`   | How long the smile must be held to trigger dictation.            |
| `smileOffHoldMs`              | `500`   | How long the smile must drop to release dictation.               |
| `deepgramLanguage`            | `en-US` | Any Deepgram language code (e.g. `en-GB`, `multi`).              |
| `deepgramModel`               | `nova-3`| Deepgram model name.                                             |
| `autoOpenOnStartup`           | `false` | Open the panel when Cursor starts.                               |
| `whistleEnabled`              | `true`  | Whistle to nudge the cursor.                                     |
| `whistleMinHz` / `whistleMaxHz` | `500` / `4000` | Whistle frequency range; pitches outside are ignored.    |
| `whistleSplit1Hz` / `Split2Hz` / `Split3Hz` | `800` / `1400` / `2200` | Boundaries between down/left/right/up bands.|
| `whistleClarity`              | `0.85`  | Minimum YIN clarity to accept a sample.                          |
| `whistleHoldMs`               | `200`   | Hold duration before the first nudge fires.                      |
| `whistleRepeatRateHz`         | `3`     | Repeat rate while a whistle is held in one band.                 |
| `dabEnabled`                  | `true`  | Dab to insert a newline.                                         |
| `dabHoldMs`                   | `250`   | Hold duration before the dab fires.                              |
| `dabCooldownMs`               | `1200`  | After firing, ignore further detections for this long.           |

## Troubleshooting

- **No camera prompt / black panel**: macOS only grants Cursor camera access if you allow it in *System Settings -> Privacy & Security -> Camera*. Restart Cursor after granting.
- **Permission denied**: re-run `Head Input: Open Panel`; if the prompt was previously dismissed, reset it via the same Privacy menu.
- **Cursor jumps too far / too little**: tune `tiltSensitivity`, `deadZoneDegrees`, and `repeatRateHz`.
- **False-positive dictation while talking**: raise `smileOnThreshold` and `smileOnHoldMs`.
- **Deepgram errors**: verify the key with `Head Input: Set Deepgram API Key` and check your network can reach `wss://api.deepgram.com`.

## Limitations

- The webview must stay open for tracking to run (the panel can be hidden but not closed).
- Tracking does not move the OS-level mouse, only the editor caret / scroll.
- The MediaPipe model is fetched from the Google CDN on first load; the extension is online for that initial download.
- macOS only tested target; Windows / Linux should work but is not exercised.

## Documentation

Deeper guides live in [`docs/`](./docs):

- [Architecture](./docs/architecture.md) — module layout, threading, CSP.
- [Data flow](./docs/data-flow.md) — every host <-> webview message in order.
- [Development](./docs/development.md) — prerequisites, watch mode, debugging.
- [Settings](./docs/settings.md) — every `headInput.*` knob explained.
- [Gestures](./docs/gestures.md) — calibration, tilt mapping, smile gate.
- [Whistle to direction](./docs/whistle.md) — pitch detection, band layout, tuning.
- [Dab to newline](./docs/dab.md) — body landmark geometry, hold time, cooldown.
- [Deepgram integration](./docs/deepgram.md) — endpoint, params, costs, latency.
- [Permissions](./docs/permissions.md) — camera/mic prompts and recovery.
- [Troubleshooting](./docs/troubleshooting.md) — common issues.
- [Manual test checklist](./docs/testing.md) — what to verify before release.

## Project layout

```
src/
  extension.ts      Activation, command routing, Deepgram, text insertion.
  panel.ts          Webview creation, CSP, asset URIs.
  statusBar.ts      Status bar item.
  deepgram.ts       Streaming WebSocket client.
  types.ts          Shared message types between host and webview.
  webview/
    main.ts         Webview entry; coordinates camera, tracker, mic.
    camera.ts       getUserMedia.
    landmarker.ts   MediaPipe FaceLandmarker per-frame loop.
    pose.ts         Head pose extraction + One-Euro smoothing.
    smile.ts        Smile blendshape + on/off hysteresis gate.
    calibration.ts  1s neutral-pose averaging.
    nudge.ts        Pose-to-direction events (dead zone, repeat-on-hold).
    mic.ts          MediaRecorder audio capture.
    audioAnalyser.ts AnalyserNode tap for pitch detection.
    pitch.ts        YIN pitch detector.
    whistle.ts      Pitch band -> direction controller.
    bodyLandmarker.ts MediaPipe PoseLandmarker per-frame loop.
    dab.ts          Geometric dab-pose detector with hold + cooldown.
    style.css       Panel styles.
    index.html      Reference only; HTML is built in panel.ts.
esbuild.mjs         Bundles extension and webview, copies wasm assets.
```
