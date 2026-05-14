# Settings reference

Every option is under `headInput.*` in `settings.json`. The extension watches for changes via `onDidChangeConfiguration` and pushes the new values to the panel without requiring a reload.

## Tilt control

### `headInput.tiltSensitivity`

- Type: `number`
- Default: `1.0`
- Range: `0.1` to `3.0`

Multiplier applied to raw yaw and pitch *before* the dead-zone comparison. Higher values mean smaller motions cross the threshold.

If you find yourself craning your neck to move the cursor, raise this. If even small head movements register, lower it.

### `headInput.deadZoneDegrees`

- Type: `number`
- Default: `8`
- Range: `1` to `30`

Degrees of effective tilt (after `tiltSensitivity` is applied) that are ignored around neutral. The release threshold is half of this — once a tilt is active, the head must return inside half the dead zone before the next motion can fire.

Smaller dead zones feel twitchier; larger ones feel "sticky" but resist accidental moves.

### `headInput.repeatRateHz`

- Type: `number`
- Default: `4`
- Range: `1` to `20`

How many cursor moves per second a *held* tilt produces. The first move fires immediately when you cross the dead zone; subsequent moves space out at `1 / repeatRateHz`.

For navigating long lines you may want this higher (10+); for precise positioning, lower (2-3).

### `headInput.verticalAction`

- Type: `string` (`cursor` or `scroll`)
- Default: `cursor`

What pitch (head up/down) does:
- `cursor` runs `cursorUp` / `cursorDown`.
- `scroll` runs `editorScroll` with `to: up/down, by: line, value: 1, revealCursor: true`.

`scroll` keeps your caret put and just moves the viewport.

### `headInput.horizontalAction`

- Type: `string` (`cursor` or `word`)
- Default: `cursor`

What yaw (head left/right) does:
- `cursor` runs `cursorLeft` / `cursorRight` (one character per nudge).
- `word` runs `cursorWordLeft` / `cursorWordRight` (one word per nudge).

`word` is much faster for navigating code; `cursor` is precise for editing inside identifiers.

## Smile / dictation gate

### `headInput.smileOnThreshold`

- Type: `number`
- Default: `0.5`
- Range: `0.1` to `0.95`

Average of `mouthSmileLeft` + `mouthSmileRight` blendshapes (each is 0–1). Above this value, a hold timer starts; once held for `smileOnHoldMs`, dictation begins.

If your neutral face triggers dictation, raise this. If your "real" smile barely registers, lower it.

### `headInput.smileOffThreshold`

- Type: `number`
- Default: `0.3`
- Range: `0.05` to `0.9`

Below this value, a hold timer starts; once held for `smileOffHoldMs`, dictation ends. Should always be lower than `smileOnThreshold` to avoid flicker — the gap between the two is the hysteresis window.

### `headInput.smileOnHoldMs`

- Type: `number`
- Default: `200`
- Range: `0` to `2000`

How long the smile must stay above `smileOnThreshold` before dictation begins. Lower = more responsive but more false positives. Zero means trigger immediately.

### `headInput.smileOffHoldMs`

- Type: `number`
- Default: `500`
- Range: `0` to `3000`

How long the smile must drop below `smileOffThreshold` before dictation ends. Higher protects against brief drops while talking; lower stops faster when you actually finish.

## ElevenLabs

### `headInput.elevenLabsLanguageCode`

- Type: `string`
- Default: `en`

Any language code ElevenLabs Scribe accepts (e.g. `en`, `de`, `es`). Leave it as `en` for English demos.

### `headInput.elevenLabsSttModel`

- Type: `string`
- Default: `scribe_v2_realtime`

ElevenLabs realtime speech-to-text model ID.

## Behavior

### `headInput.autoOpenOnStartup`

- Type: `boolean`
- Default: `false`

Open the input panel automatically when Cursor finishes activating. Useful if you live in dictation; otherwise leave it off so the camera/mic only initialize on demand.

## Where the API key lives

The ElevenLabs API key is **not** a setting. It is stored in `SecretStorage` under the secret name `headInput.elevenLabsApiKey`. Manage it with:

- `Head Input: Set ElevenLabs API Key`
- `Head Input: Clear ElevenLabs API Key`
