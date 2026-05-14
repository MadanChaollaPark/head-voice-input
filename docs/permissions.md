# Camera and microphone permissions

The webview needs both camera and microphone access. The first time you open the panel, the browser-style permission prompt appears inside the webview.

## How permission is requested

`startCamera()` in `src/webview/camera.ts` calls `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`. The user agent (Cursor / VS Code, which use Chromium) shows a one-time prompt scoped to that webview origin.

If you accept, the `MediaStream` returned is split:
- The video track feeds the `<video>` element that `FaceLandmarker.detectForVideo` reads from.
- The audio track is held in reserve and only attached to the PCM recorder when dictation actually starts.

## If you accidentally clicked "Block"

You'll see an error toast like `Camera permission denied`. To recover:

### macOS

1. Open `System Settings -> Privacy & Security -> Camera`. Make sure Cursor / VS Code is checked.
2. Repeat for `Microphone`.
3. Restart Cursor.
4. Inside the webview, right-click and choose "Open Webview Developer Tools".
5. In devtools, click the lock icon in the URL bar (some builds show a settings cog) and reset the camera + microphone permissions for that origin.
6. Reload the panel.

### Windows

1. Open `Settings -> Privacy & security -> Camera`. Allow desktop apps to access your camera.
2. Repeat for `Microphone`.
3. Restart Cursor.
4. In the webview devtools, reset site permissions as above.

### Linux

Permissions live in your browser engine config. The simplest reset is to delete the webview's local storage:

```bash
rm -rf ~/.config/Cursor/User/globalStorage/<extension-id>
```

The extension id for development builds is `madan.head-voice-input` (see `package.json#publisher`).

## Permission propagation

VS Code webviews currently inherit the parent process's media permissions on first use. If your *whole* Cursor app is blocked from camera access at the OS level, the webview prompt will fail immediately without asking. Check the OS-level toggle first.

## Privacy posture

- The video stream never leaves your machine. Frames are processed in-process by MediaPipe wasm.
- The audio stream goes only to ElevenLabs while you are smiling. The host commits and closes the WebSocket when the smile gate flips off.
- If you want to be extra cautious, watch your OS's camera/microphone indicator. The green dot or LED should turn off the moment you close the panel.

## Headless / remote workspaces

If you are running Cursor over Remote-SSH or Codespaces, the webview runs on the *server* side but the user agent that handles `getUserMedia` is your local machine. Camera and microphone hardware on the remote host is irrelevant; you need permission on whatever device renders the UI.
