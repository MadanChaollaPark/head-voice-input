# Deepgram integration

This extension uses [Deepgram](https://deepgram.com)'s streaming speech-to-text API. The host opens a WebSocket on dictation start, forwards audio chunks coming from the webview, and receives interim and final transcripts.

## Getting an API key

1. Sign up at <https://console.deepgram.com>. New accounts come with free credits.
2. Create a project, then create an API key with at least the "Member" role.
3. In Cursor, run `Head Input: Set Deepgram API Key` and paste the key when prompted.

The key is stored via VS Code's `SecretStorage`, not in `settings.json`. To remove it: `Head Input: Clear Deepgram API Key`.

## Connection details

Endpoint:

```
wss://api.deepgram.com/v1/listen
```

Authentication header:

```
Authorization: Token <your_api_key>
```

Query parameters used by this extension:

| Parameter         | Value                          | Why                                        |
| ----------------- | ------------------------------ | ------------------------------------------ |
| `model`           | `headInput.deepgramModel`      | Latest is `nova-3`.                        |
| `language`        | `headInput.deepgramLanguage`   | e.g. `en-US`, `multi`.                     |
| `smart_format`    | `true`                         | Adds punctuation, capitalization, numerals.|
| `punctuate`       | `true`                         | Belt-and-suspenders punctuation.           |
| `interim_results` | `true`                         | Shows partial transcripts in the panel.    |
| `endpointing`     | `300`                          | Marks segment-final after 300 ms of silence.|
| `vad_events`      | `true`                         | Voice-activity events; useful for tuning.  |

If you need to tweak the URL, edit `src/deepgram.ts`.

## Audio format

The webview produces audio with `MediaRecorder`. Most platforms select `audio/webm;codecs=opus`, which Deepgram auto-detects. You don't need to set `encoding` explicitly.

If Deepgram returns no transcripts on your platform:
1. Open the webview developer tools and confirm `MediaRecorder.mimeType` actually selected webm or ogg.
2. As a fallback, switch the WSS URL to include `?encoding=opus` (or `webm`).
3. For the most predictable behavior, replace `MediaRecorder` with an `AudioWorkletNode` that emits `linear16` PCM at 16 kHz, and append `&encoding=linear16&sample_rate=16000` to the URL.

## Costs

Deepgram bills by audio minutes streamed. As of writing, `nova-3` is around $0.0058 per minute. Idle time between dictations is **not** billed because the WebSocket is closed when you stop smiling.

A rough budget: dictating ~10 minutes of speech per work day costs about $1–$2 per month.

## Latency expectations

- **First-byte (interim) transcript**: typically 150–400 ms after you start speaking.
- **Final transcript**: depends on `endpointing`. With `300` ms, expect a final transcript ~300 ms after you pause.
- **Insertion latency**: negligible; once the host receives `is_final: true`, the editor edit is synchronous.

If you feel the lag is too high, lower `endpointing`. Going below `100` produces fragmented finals.

## Switching providers

`DeepgramClient` lives entirely in `src/deepgram.ts` with a small surface (`start`, `sendAudio`, `stop`). Replacing it with AssemblyAI streaming, OpenAI Realtime, or local Whisper requires changing only that file plus the constructor call in `src/extension.ts`.

## Privacy

The host streams audio directly to Deepgram. The extension does not log audio or transcripts. Deepgram's data retention is governed by their policy: <https://deepgram.com/privacy>.
