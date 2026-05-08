# Security

## Reporting a vulnerability

Email security reports to the GitHub account owner via a private channel — do **not** open a public issue.

If you believe a vulnerability could put a user's Deepgram key, audio, or video at risk, treat it as security-sensitive.

## Trust boundaries in this extension

- **Camera and microphone**: requested via `getUserMedia` inside the webview. Streams stay within the webview process; only the audio bytes from `MediaRecorder` are forwarded to the extension host (and from there to Deepgram) when dictation is active.
- **Deepgram API key**: stored in Cursor / VS Code's `SecretStorage`, never written to `settings.json` or shipped over `postMessage` to the webview. The host opens the WebSocket and proxies audio.
- **Network egress**: the webview connects to `https://storage.googleapis.com` only to fetch the MediaPipe model on first load; the host opens a `wss://api.deepgram.com` connection during dictation. Both endpoints are pinned in the webview Content-Security-Policy.
- **Code execution**: the webview uses a strict CSP with a per-load nonce; only the bundled `dist/webview.js` runs.

## Data handling

- Audio captured during dictation is streamed directly to Deepgram. The extension does not persist audio.
- Video frames stay inside the webview and are processed by MediaPipe locally; the extension does not transmit video anywhere.
- Transcripts returned by Deepgram are forwarded to the webview for display and inserted into the active editor — they are not logged.

## Things to be aware of

- Disabling the panel does **not** stop Cursor from holding camera/mic permission grants; revoke them in your OS settings if you want to be sure.
- The MediaPipe model is fetched at runtime; in air-gapped environments the panel will fail to initialize.
- Deepgram retains audio per their data usage policy — see <https://deepgram.com/security> for details.
