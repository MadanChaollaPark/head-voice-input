# Manual test checklist

There is no automated test suite yet. This checklist is what to walk through before tagging a release or merging a behaviorally significant change.

## Pre-flight

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds; `dist/extension.js`, `dist/webview.js`, and `dist/wasm/` all exist.
- [ ] No new dependencies added without updating `package.json` and `package-lock.json`.

## Activation

- [ ] Press `F5` in the project window. The Extension Development Host opens.
- [ ] Run `Head Input: Open Panel` from the command palette. The panel opens to the right.
- [ ] Camera + microphone permission prompts appear and can be granted.
- [ ] Status text transitions: `Initializing -> Calibrating -> Calibrated -> Idle`.

## Calibration

- [ ] Default calibration completes within ~1 second of the camera going live.
- [ ] `Cmd/Ctrl+Shift+R` triggers a fresh calibration.
- [ ] `Head Input: Recalibrate Neutral Pose` from the command palette has the same effect.
- [ ] Status text returns to `Calibrated -> Idle` after recalibration.

## Tilt — cursor mode (defaults)

- [ ] With `verticalAction: cursor` and `horizontalAction: cursor`:
  - Tilt down: caret moves down one line per tilt.
  - Tilt up: caret moves up one line.
  - Tilt left: caret moves one character left.
  - Tilt right: caret moves one character right.
- [ ] Holding a tilt produces moves at roughly `repeatRateHz` (default 4 Hz).
- [ ] Returning to neutral cancels the held tilt; the next tilt fires fresh.
- [ ] Brief jitter inside the dead zone does not produce moves.

## Tilt — alternate modes

- [ ] Set `verticalAction: scroll`. Tilt up/down scrolls the editor; the caret stays put.
- [ ] Set `horizontalAction: word`. Tilt left/right moves by word.

## Smile -> dictation

- [ ] With ElevenLabs API key set: smile, the status flips to `Dictating`.
- [ ] Speak a short sentence. Partial transcripts appear in the panel.
- [ ] Stop smiling. The committed transcript is inserted at the caret with a leading space if the preceding char isn't whitespace.
- [ ] Smile again, dictate again. Multiple sessions in a row work.

## Smile gate edge cases

- [ ] Hysteresis: a slight smile drop (above `smileOffThreshold`) does *not* end dictation.
- [ ] A real smile drop (below `smileOffThreshold`) for `smileOffHoldMs` ends it.
- [ ] Setting `smileOnHoldMs: 0` makes dictation start instantly on smile.

## Pause / resume

- [ ] Run `Head Input: Toggle Tracking`. Status flips to `Paused`. Tilts no longer move the caret.
- [ ] Run again. Status flips back to `Idle`. Tilts work again.
- [ ] Camera/mic indicator stays on throughout (we don't tear down the stream).

## API key management

- [ ] `Head Input: Set ElevenLabs API Key`: prompts for input, masks characters.
- [ ] After setting, smiling actually opens the WebSocket (check Debug Console).
- [ ] `Head Input: Clear ElevenLabs API Key`: subsequent dictation prompts for the key again.

## Settings hot-reload

- [ ] Open `settings.json` and change `headInput.deadZoneDegrees` from 8 to 20. Save.
- [ ] No reload needed. The next tilt feels noticeably less twitchy.
- [ ] Change `headInput.smileOnThreshold` to 0.95. Save.
- [ ] Smiling no longer triggers dictation (threshold near maximum).

## Failure modes

- [ ] Block camera permission. Panel shows an error toast; doesn't crash.
- [ ] Block microphone permission only. Tilt still works; dictation shows a clear error.
- [ ] Disconnect Wi-Fi mid-dictation. Toast appears within a few seconds; subsequent smiles re-attempt the connection.
- [ ] Set an invalid API key. First dictation shows an auth error; the bad key is *not* cleared automatically (user must run "Clear" themselves).

## Performance sanity

- [ ] CPU at idle (panel open, no tilt, no smile): under 15% on Apple Silicon, under 25% on a 2020-era Intel laptop.
- [ ] Latency from "I tilt my head" to "caret moved": under 150 ms feels right; under 300 ms is acceptable.
- [ ] Latency from "I stop smiling" to "transcript inserted": dominated by ElevenLabs commit latency.

## Cleanup

- [ ] Close the panel. Camera / mic indicator turns off.
- [ ] Reopen the panel. Permissions are remembered; calibration runs again.
