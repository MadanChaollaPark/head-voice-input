import type {
  HeadInputConfig,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "../types";
import { describeCameraError, startCamera, type CameraHandle } from "./camera";
import { startTracker, type TrackerHandle } from "./landmarker";
import { PoseSmoother, poseFromResult, radToDeg, type HeadPose } from "./pose";
import { SmileGate, smileFromResult } from "./smile";
import { Calibrator } from "./calibration";

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
const calibrator = new Calibrator();

const defaultConfig: HeadInputConfig = {
  tiltSensitivity: 1.0,
  deadZoneDegrees: 8,
  repeatRateHz: 4,
  verticalAction: "cursor",
  horizontalAction: "cursor",
  smileOnThreshold: 0.5,
  smileOffThreshold: 0.3,
  smileOnHoldMs: 200,
  smileOffHoldMs: 500,
  deepgramLanguage: "en-US",
  deepgramModel: "nova-3",
};
let config: HeadInputConfig = { ...defaultConfig };

const smileGate = new SmileGate({
  onThreshold: config.smileOnThreshold,
  offThreshold: config.smileOffThreshold,
  onHoldMs: config.smileOnHoldMs,
  offHoldMs: config.smileOffHoldMs,
});

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

function updateBars(pose: HeadPose, smile: number, smileActive: boolean): void {
  const yawDeg = radToDeg(pose.yaw);
  const pitchDeg = radToDeg(pose.pitch);
  setBar("yaw", yawDeg, 30);
  setBar("pitch", pitchDeg, 25);
  setText("yaw-value", `${yawDeg.toFixed(0)}°`);
  setText("pitch-value", `${pitchDeg.toFixed(0)}°`);

  const smileFill = document.getElementById("smile-fill") as HTMLDivElement | null;
  if (smileFill) {
    smileFill.style.width = `${Math.round(smile * 100)}%`;
  }
  const smileBar = document.getElementById("smile-bar");
  smileBar?.classList.toggle("active", smileActive);
  setText("smile-value", `${Math.round(smile * 100)}%`);

  const pill = document.getElementById("dictation-pill");
  pill?.classList.toggle("on", smileActive);
  setText("dictation-label", smileActive ? "dictating" : "idle");
}

function setBar(prefix: string, value: number, range: number): void {
  const fill = document.getElementById(`${prefix}-fill`) as HTMLDivElement | null;
  if (!fill) {
    return;
  }
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
        calibrator.offer(smoothed, ts);
        const relative = calibrator.apply(smoothed);
        const smile = smileFromResult(result);
        const gate = smileGate.update(smile, ts);
        if (gate.changed) {
          send({ type: "dictation", active: gate.active });
        }
        updateBars(relative, smile, gate.active);
        send({
          type: "pose",
          yaw: relative.yaw,
          pitch: relative.pitch,
          smile,
        });
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

  setBanner("Tracking — hold a neutral pose for calibration...", "info");
  send({ type: "ready" });
  startCalibration("auto");
}

function startCalibration(reason: "auto" | "manual"): void {
  if (reason === "manual") {
    smoother.reset();
    smileGate.reset();
  }
  setBanner("Calibrating — hold a neutral pose...", "info");
  calibrator.begin({
    durationMs: 1000,
    onComplete: () => {
      setBanner("Calibrated. Tilt your head to move the cursor.", "success");
    },
  });
}

function attachToolbar(): void {
  const calibBtn = document.getElementById("calibrate");
  calibBtn?.addEventListener("click", () => startCalibration("manual"));
  const toggleBtn = document.getElementById("toggle");
  toggleBtn?.addEventListener("click", () => {
    if (!tracker) {
      return;
    }
    const next = !tracker.paused();
    tracker.setPaused(next);
    toggleBtn.textContent = next ? "Resume" : "Pause";
  });
}

attachToolbar();

window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "config":
      config = msg.config;
      smileGate.setOptions({
        onThreshold: config.smileOnThreshold,
        offThreshold: config.smileOffThreshold,
        onHoldMs: config.smileOnHoldMs,
        offHoldMs: config.smileOffHoldMs,
      });
      break;
    case "calibrate":
      startCalibration("manual");
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
