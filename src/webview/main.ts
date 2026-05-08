import type {
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "../types";
import { describeCameraError, startCamera, type CameraHandle } from "./camera";
import { startTracker, type TrackerHandle } from "./landmarker";
import { PoseSmoother, poseFromResult, radToDeg, type HeadPose } from "./pose";

declare const acquireVsCodeApi: () => {
  postMessage: (msg: WebviewToHostMessage) => void;
};

declare global {
  interface Window {
    __HEAD_INPUT__: { wasmRoot: string };
  }
}

const vscode = acquireVsCodeApi();
const smoother = new PoseSmoother();

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

function updateBars(pose: HeadPose): void {
  const yawDeg = radToDeg(pose.yaw);
  const pitchDeg = radToDeg(pose.pitch);
  setBar("yaw", yawDeg, 30);
  setBar("pitch", pitchDeg, 25);
  setText("yaw-value", `${yawDeg.toFixed(0)}°`);
  setText("pitch-value", `${pitchDeg.toFixed(0)}°`);
}

function setBar(prefix: string, value: number, range: number): void {
  const fill = document.getElementById(`${prefix}-fill`) as HTMLDivElement | null;
  if (!fill) {
    return;
  }
  // Map [-range, +range] to [0%, 100%], with center at 50%.
  const clamped = Math.max(-range, Math.min(range, value));
  const pct = ((clamped + range) / (2 * range)) * 100;
  fill.style.width = `${pct}%`;
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
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
      onResult: (result, ts) => {
        const raw = poseFromResult(result);
        if (!raw) {
          return;
        }
        const smoothed = smoother.smooth(raw, ts);
        updateBars(smoothed);
        send({ type: "pose", yaw: smoothed.yaw, pitch: smoothed.pitch, smile: 0 });
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

  setBanner("Tracking. Tilt your head to test the bars.", "success");
  send({ type: "ready" });
}

window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "config":
      break;
    case "calibrate":
      smoother.reset();
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
