# Data flow

This document walks through every message that crosses the host <-> webview boundary, in the order they typically fire.

All message shapes live in [`src/types.ts`](../src/types.ts). Both bundles import from the same file, so a mismatch is a TypeScript error in both directions.

## Direction summary

```
        +------------------+              +-------------------+
        | Extension host   |              | Webview            |
        |                  | -- config --> |                   |
        |                  | -- transcript-forward -->        |
        |                  | -- calibrate -->                 |
        |                  | -- toggle    -->                 |
        |                  |              |                   |
        |                  | <-- ready ---                    |
        |                  | <-- pose ---                     |
        |                  | <-- nudge ---                    |
        |                  | <-- dictation ---                |
        |                  | <-- audio ---                    |
        |                  | <-- dictation-end ---            |
        |                  | <-- transcript ---               |
        |                  | <-- error ---                    |
        |                  | <-- status ---                   |
        +------------------+              +-------------------+
```

## Webview -> host messages

### `ready`

Sent once after the camera, tracker, and mic are initialized.

The host responds with a `config` message so the webview's local copy of `HeadInputConfig` matches the user's `settings.json`.

### `pose`

Fires every frame after the smoother and calibrator have run. Carries the current relative `yaw`, `pitch`, and `smile` values. Currently the host ignores it; it's reserved for future debug overlays.

### `nudge`

Carries a `Direction` (`up | down | left | right`) emitted by `NudgeController` when:
- A tilt first crosses the dead-zone threshold, or
- A held tilt has been past the threshold for `1 / repeatRateHz` seconds since the last emission.

The host translates each nudge to a VS Code command:

| Direction | `verticalAction = cursor`                  | `verticalAction = scroll`         |
| --------- | ------------------------------------------ | --------------------------------- |
| up        | `cursorUp`                                 | `editorScroll { to: up, by: line }` |
| down      | `cursorDown`                               | `editorScroll { to: down, by: line }` |

| Direction | `horizontalAction = cursor` | `horizontalAction = word` |
| --------- | --------------------------- | ------------------------- |
| left      | `cursorLeft`                | `cursorWordLeft`          |
| right     | `cursorRight`               | `cursorWordRight`         |

### `dictation`

Carries `active: true | false`. Fires only on state transitions (the SmileGate has internal hysteresis so it is debounced).

On `active: true` the host:
1. Reads the Deepgram API key from `SecretStorage`. If absent, prompts the user; aborts if still missing.
2. Constructs `DeepgramClient` with the language and model from settings.
3. Calls `dictation.start()` which opens the WSS connection. Audio buffered before `OPEN` is replayed once the socket opens.

On `active: false` the host calls `dictation.stop()` which sends Deepgram's `CloseStream` control message and closes the socket.

### `audio`

Sent for every `MediaRecorder` `dataavailable` event while dictation is active. Carries:
- `data: ArrayBuffer` - the raw chunk from `MediaRecorder` (webm/opus on most browsers).
- `mimeType: string` - whatever `MediaRecorder` selected.
- `first: boolean` - true for the first chunk of a session; this chunk includes the webm container header.

The host forwards `data` to the Deepgram WebSocket via `dictation.sendAudio`. If the socket is still connecting, chunks are buffered and replayed when `OPEN` fires.

### `dictation-end`

Defensive signal sent when `MediaRecorder.stop()` finishes; the host treats it the same as a `dictation: false`.

### `error`

Carries a human-readable `message`. The host shows it as an error toast and updates the status bar with a warning icon.

### `status`

Currently unused. Reserved for future subtle status updates that don't deserve a toast.

## Host -> webview messages

### `config`

Carries the current `HeadInputConfig`. The webview applies the values to:
- `SmileGate.setOptions` (thresholds + hold times)
- `NudgeController.setOptions` (dead zone + sensitivity + repeat rate)

`deepgramKey` in this message is always `null`; the API key never travels into the webview.

### `transcript-forward`

Sent on every Deepgram transcript (interim and final). The webview shows it in the panel's transcript area; the trailing ellipsis marks interim transcripts.

### `calibrate`

Sent when the user runs `Head Input: Recalibrate Neutral Pose` from the command palette. The webview begins a fresh 1-second sample window.

### `toggle`

Sent when the user runs `Head Input: Toggle Tracking`. The webview pauses or resumes the per-frame detection loop without tearing down the camera.

## End-to-end sequence: a single dictation

```
webview                                      host                            deepgram
   |                                           |                                |
   |-- ready -------------------------------->|                                |
   |                                           |-- config ------------------>|
   |                                           |                                |
   |  (auto-calibration runs internally)       |                                |
   |                                           |                                |
   |  (user smiles, gate flips)                |                                |
   |-- dictation { active: true } ----------->|                                |
   |                                           |-- WS connect ---------------->|
   |  MediaRecorder.start()                    |                                |
   |-- audio (first chunk, webm header) ----->|-- frame ------------------>|
   |-- audio (chunk) ------------------------>|-- frame ------------------>|
   |                                           |                          <--- transcript (interim)
   |<-- transcript-forward ------------------|                                |
   |-- audio (chunk) ------------------------>|-- frame ------------------>|
   |                                           |                          <--- transcript (final)
   |<-- transcript-forward ------------------|                                |
   |                                           |   editor.edit(insert text)   |
   |                                           |                                |
   |  (user stops smiling)                     |                                |
   |-- dictation { active: false } ---------->|                                |
   |  MediaRecorder.stop()                     |                                |
   |-- dictation-end ----------------------->|-- CloseStream ------------>|
   |                                           |-- WS close ----------------->|
```
