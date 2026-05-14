# ElevenLabs integration

This extension uses ElevenLabs Scribe realtime speech-to-text. The host opens a WebSocket on dictation start, forwards PCM16 audio chunks coming from the webview, receives partial and committed transcripts, and inserts committed transcripts into the active editor.

## Getting an API key

1. Sign up at <https://elevenlabs.io>.
2. Create an API key in the ElevenLabs dashboard.
3. In Cursor, run `Head Input: Set ElevenLabs API Key` and paste the key when prompted.

The key is stored via VS Code's `SecretStorage`, not in `settings.json`. To remove it: `Head Input: Clear ElevenLabs API Key`.

## Connection details

Endpoint:

```text
wss://api.elevenlabs.io/v1/speech-to-text/realtime
```

Authentication header:

```text
xi-api-key: <your_api_key>
```

Query parameters used by this extension:

| Parameter         | Value                             | Why                                      |
| ----------------- | --------------------------------- | ---------------------------------------- |
| `model_id`        | `headInput.elevenLabsSttModel`    | Defaults to `scribe_v2_realtime`.        |
| `language_code`   | `headInput.elevenLabsLanguageCode`| Defaults to English (`en`).              |
| `audio_format`    | `pcm_16000`                       | 16 kHz mono PCM16, ElevenLabs' recommended realtime format. |
| `commit_strategy` | `manual`                          | Smile release explicitly commits the segment. |

If you need to tweak the URL, edit `src/elevenlabsStt.ts`.

## Audio format

The webview uses Web Audio to read the microphone track, downsample it to 16 kHz mono, convert it to 16-bit little-endian PCM, and emit roughly 250 ms chunks.

Each host WebSocket message is shaped like:

```json
{
  "message_type": "input_audio_chunk",
  "audio_base_64": "<base64 pcm16>",
  "sample_rate": 16000,
  "commit": false
}
```

When dictation ends, the host sends a final `input_audio_chunk` message with `commit: true` so ElevenLabs emits a committed transcript.

## Latency expectations

- **Partial transcript**: typically appears while audio is still streaming.
- **Committed transcript**: arrives after smile release and manual commit.
- **Insertion latency**: negligible; once the host receives `committed_transcript`, the editor edit is synchronous.

## Privacy

The host streams audio directly to ElevenLabs only while dictation is active. The extension does not log or persist audio or transcripts. ElevenLabs data handling is governed by their policies and workspace settings.
