import type {
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "../types";
import { describeCameraError, startCamera, type CameraHandle } from "./camera";
import { startTracker, type TrackerHandle } from "./landmarker";

declare const acquireVsCodeApi: () => {
  postMessage: (msg: WebviewToHostMessage) => void;
};

declare global {
  interface Window {
    __HEAD_INPUT__: { wasmRoot: string };
  }
}

const vscode = acquireVsCodeApi();

function send(msg: WebviewToHostMessage): void {
  vscode.postMessage(msg);
}

function setBanner(text: string, kind: "info" | "error" | "success" = "info"): void {
  const el = document.getElementById("banner");
  if (!el) {
    return;
  }
  el.textContent = text;
  el.className = `banner${kind === "info" ? "" : ` ${kind}`}`;
}

let camera: CameraHandle | undefined;
let tracker: TrackerHandle | undefined;

async function init(): Promise<void> {
  const video = document.getElementById("video") as HTMLVideoElement | null;
  if (!video) {
    setBanner("Internal error: video element missing", "error");
    return;
  }

  setBanner("Requesting camera...");
  try {
    camera = await startCamera(video);
  } catch (err) {
    const message = describeCameraError(err);
    setBanner(message, "error");
    send({ type: "error", message });
    return;
  }

  setBanner("Loading face tracker...");
  try {
    tracker = await startTracker({
      video,
      wasmRoot: window.__HEAD_INPUT__.wasmRoot,
      onResult: () => {
        // pose + smile extraction wired in later commits
      },
      onError: (err) => {
        send({ type: "error", message: `Tracker error: ${String(err)}` });
      },
    });
  } catch (err) {
    const message = `Failed to load face tracker: ${err instanceof Error ? err.message : String(err)}`;
    setBanner(message, "error");
    send({ type: "error", message });
    return;
  }

  setBanner("Tracking. Smile to dictate (wired in later commits).", "success");
  send({ type: "ready" });
}

window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "config":
    case "calibrate":
      break;
    case "toggle":
      if (tracker) {
        tracker.setPaused(!tracker.paused());
      }
      break;
  }
});

window.addEventListener("beforeunload", () => {
  tracker?.stop();
  camera?.stop();
});

void init();
