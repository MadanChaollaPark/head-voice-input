import type {
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "../types";
import { describeCameraError, startCamera, type CameraHandle } from "./camera";

declare const acquireVsCodeApi: () => {
  postMessage: (msg: WebviewToHostMessage) => void;
};

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

  setBanner("Camera live. Face tracking will start in the next commit.", "success");
  send({ type: "ready" });
}

window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "config":
    case "calibrate":
    case "toggle":
      // wired in later commits
      break;
  }
});

window.addEventListener("beforeunload", () => {
  camera?.stop();
});

void init();
