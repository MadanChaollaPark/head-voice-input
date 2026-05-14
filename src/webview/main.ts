/**
 * Webview entry point. Wires the camera, FaceLandmarker, smile gate, nudge
 * controller, and microphone recorder together; talks to the host over
 * `postMessage`. See `docs/architecture.md` for the high-level diagram.
 */
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
import { NudgeController, configToNudgeOptions } from "./nudge";
import { MicRecorder } from "./mic";
import { startAudioAnalyser, type AudioAnalyserHandle } from "./audioAnalyser";
import { PitchDetector } from "./pitch";
import { WhistleController } from "./whistle";
import { startBodyTracker, type BodyTrackerHandle } from "./bodyLandmarker";
import { DabDetector } from "./dab";

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
  elevenLabsLanguageCode: "en",
  elevenLabsSttModel: "scribe_v2_realtime",
  whistleEnabled: true,
  whistleMinHz: 500,
  whistleMaxHz: 4000,
  whistleSplit1Hz: 800,
  whistleSplit2Hz: 1400,
  whistleSplit3Hz: 2200,
  whistleClarity: 0.85,
  whistleHoldMs: 200,
  whistleRepeatRateHz: 3,
  dabEnabled: true,
  dabHoldMs: 250,
  dabCooldownMs: 1200,
};
let config: HeadInputConfig = { ...defaultConfig };

const smileGate = new SmileGate({
  onThreshold: config.smileOnThreshold,
  offThreshold: config.smileOffThreshold,
  onHoldMs: config.smileOnHoldMs,
  offHoldMs: config.smileOffHoldMs,
});
const nudges = new NudgeController(configToNudgeOptions(config));
const whistle = new WhistleController({
  split1Hz: config.whistleSplit1Hz,
  split2Hz: config.whistleSplit2Hz,
  split3Hz: config.whistleSplit3Hz,
  minHz: config.whistleMinHz,
  maxHz: config.whistleMaxHz,
  minClarity: config.whistleClarity,
  holdMs: config.whistleHoldMs,
  repeatRateHz: config.whistleRepeatRateHz,
});
const dabDetector = new DabDetector({
  holdMs: config.dabHoldMs,
  cooldownMs: config.dabCooldownMs,
  minVisibility: 0.5,
});

let audioAnalyser: AudioAnalyserHandle | undefined;
let pitchDetector: PitchDetector | undefined;
let pitchBuffer: Float32Array | undefined;
let bodyTracker: BodyTrackerHandle | undefined;

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

  setDictationIndicator(smileActive);
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
let mic: MicRecorder | undefined;
let dictationStopping = false;
let dictationStopShouldNotifyHost = false;
let suppressDictationUntilSmileDrops = false;

function setDictationIndicator(active: boolean): void {
  const pill = document.getElementById("dictation-pill");
  pill?.classList.toggle("on", active);
  setText("dictation-label", active ? "dictating" : "idle");
}

function localDictationActive(): boolean {
  return smileGate.isActive() || (mic?.isActive() ?? false) || dictationStopping;
}

function startLocalDictation(): void {
  if (dictationStopping || suppressDictationUntilSmileDrops) {
    return;
  }
  setDictationIndicator(true);
  send({ type: "dictation", active: true });
  try {
    mic?.start();
  } catch (err) {
    send({ type: "error", message: `Mic error: ${String(err)}` });
    void stopLocalDictation({ notifyHost: true, suppressUntilSmileDrops: true });
  }
}

async function stopLocalDictation(opts: {
  notifyHost: boolean;
  suppressUntilSmileDrops?: boolean;
}): Promise<void> {
  const hadLocalActivity = localDictationActive();
  if (opts.notifyHost) {
    dictationStopShouldNotifyHost = true;
  }
  if (opts.suppressUntilSmileDrops) {
    suppressDictationUntilSmileDrops = true;
  }
  smileGate.reset();
  setDictationIndicator(false);
  if (!hadLocalActivity) {
    dictationStopShouldNotifyHost = false;
    return;
  }
  if (dictationStopping) {
    return;
  }
  dictationStopping = true;
  try {
    await mic?.stop();
  } catch (err) {
    send({ type: "error", message: `Mic error: ${String(err)}` });
  } finally {
    dictationStopping = false;
    smileGate.reset();
    setDictationIndicator(false);
    const notifyHost = dictationStopShouldNotifyHost;
    dictationStopShouldNotifyHost = false;
    if (notifyHost && hadLocalActivity) {
      send({ type: "dictation", active: false });
      send({ type: "dictation-end" });
    }
  }
}

function setPaused(paused: boolean): void {
  tracker?.setPaused(paused);
  const toggleBtn = document.getElementById("toggle");
  if (toggleBtn) {
    toggleBtn.textContent = paused ? "Resume" : "Pause";
  }
  send({
    type: "status",
    message: paused ? "paused" : "tracking",
    state: paused ? "paused" : "tracking",
  });
  if (paused) {
    void stopLocalDictation({ notifyHost: true, suppressUntilSmileDrops: true });
  }
}

interface PitchSnapshot {
  hz: number | null;
  clarity: number;
  directions: ReturnType<WhistleController["update"]>;
  band: ReturnType<WhistleController["currentBand"]>;
}

/**
 * Read one buffer from the audio analyser, run YIN, feed the result through
 * the whistle controller. Returns null when the analyser isn't ready or
 * whistle is disabled. Resets the controller when paused or while dictating.
 */
function sampleWhistle(ts: number, smileActive: boolean): PitchSnapshot | null {
  if (!audioAnalyser || !pitchDetector || !pitchBuffer) {
    return null;
  }
  if (!config.whistleEnabled || smileActive || (tracker?.paused() ?? false)) {
    whistle.reset();
    return { hz: null, clarity: 0, directions: [], band: null };
  }
  audioAnalyser.read(pitchBuffer);
  const pitch = pitchDetector.detect(pitchBuffer);
  const directions = whistle.update(pitch.hz, pitch.clarity, ts);
  return { hz: pitch.hz, clarity: pitch.clarity, directions, band: whistle.currentBand() };
}

function updateDabIndicator(armed: boolean): void {
  const pill = document.getElementById("dab-pill");
  if (!pill) return;
  pill.classList.toggle("armed", armed);
}

function updateWhistleBar(info: PitchSnapshot | null): void {
  const fill = document.getElementById("whistle-fill") as HTMLDivElement | null;
  const valueEl = document.getElementById("whistle-value");
  const bar = document.getElementById("whistle-bar");
  if (!info || info.hz === null) {
    if (fill) fill.style.width = "0%";
    if (valueEl) valueEl.textContent = "-";
    bar?.classList.remove("active");
    return;
  }
  const range = config.whistleMaxHz - config.whistleMinHz;
  const pct = Math.max(0, Math.min(100, ((info.hz - config.whistleMinHz) / Math.max(range, 1)) * 100));
  if (fill) fill.style.width = `${pct.toFixed(0)}%`;
  if (valueEl) {
    const hzLabel = info.hz >= 1000 ? `${(info.hz / 1000).toFixed(2)} kHz` : `${info.hz.toFixed(0)} Hz`;
    valueEl.textContent = info.band ? `${hzLabel} ▸ ${info.band}` : hzLabel;
  }
  bar?.classList.toggle("active", info.band !== null);
}

/**
 * Boot sequence: open the camera, attach mic recorder, load FaceLandmarker,
 * start the per-frame loop, then auto-calibrate. Errors at any step send an
 * `error` message and abort.
 */
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

  mic = new MicRecorder(camera.stream, (chunk) => {
    send({ type: "audio", data: chunk.data, mimeType: chunk.mimeType, first: chunk.first });
  });

  try {
    audioAnalyser = await startAudioAnalyser(camera.stream);
    pitchDetector = new PitchDetector(audioAnalyser.sampleRate, config.whistleMinHz, config.whistleMaxHz);
    pitchBuffer = new Float32Array(audioAnalyser.bufferSize);
  } catch (err) {
    send({ type: "error", message: `Whistle disabled: ${err instanceof Error ? err.message : String(err)}` });
  }

  setBanner("Loading face tracker...");
  try {
    tracker = await startTracker({
      video,
      wasmRoot: window.__HEAD_INPUT__.wasmRoot,
      onResult: (result, ts) => {
        const raw = poseFromResult(result);
        if (!raw) {
          void stopLocalDictation({ notifyHost: true, suppressUntilSmileDrops: true });
          return;
        }
        const smoothed = smoother.smooth(raw, ts);
        calibrator.offer(smoothed, ts);
        const relative = calibrator.apply(smoothed);
        const smile = smileFromResult(result);
        if (suppressDictationUntilSmileDrops && smile <= config.smileOffThreshold) {
          suppressDictationUntilSmileDrops = false;
        }
        const gate = suppressDictationUntilSmileDrops
          ? { changed: false, active: false }
          : smileGate.update(smile, ts);
        if (gate.changed) {
          if (gate.active) {
            startLocalDictation();
          } else {
            void stopLocalDictation({ notifyHost: true, suppressUntilSmileDrops: true });
          }
        }
        if (calibrator.hasNeutral()) {
          for (const direction of nudges.update(relative, ts)) {
            send({ type: "nudge", direction });
          }
        }

        const dictationActive = localDictationActive();
        const pitchInfo = sampleWhistle(ts, dictationActive);
        if (calibrator.hasNeutral() && pitchInfo) {
          for (const direction of pitchInfo.directions) {
            send({ type: "nudge", direction });
          }
        }
        updateBars(relative, smile, dictationActive);
        updateWhistleBar(pitchInfo);
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

  try {
    bodyTracker = await startBodyTracker({
      video,
      wasmRoot: window.__HEAD_INPUT__.wasmRoot,
      onResult: (result, ts) => {
        if (!config.dabEnabled || (tracker?.paused() ?? false)) {
          dabDetector.reset();
          updateDabIndicator(false);
          return;
        }
        const landmarks = result.landmarks?.[0] ?? null;
        const fired = dabDetector.update(landmarks, ts);
        updateDabIndicator(dabDetector.arming());
        if (fired) {
          send({ type: "dab" });
        }
      },
      onError: (err) => {
        send({ type: "error", message: `Body tracker error: ${String(err)}` });
      },
    });
  } catch (err) {
    send({
      type: "error",
      message: `Dab disabled: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  setBanner("Tracking — hold a neutral pose for calibration...", "info");
  send({ type: "ready" });
  startCalibration("auto");
}

/**
 * Begin a fresh neutral-pose calibration window. `manual` resets all
 * downstream state (smoother, smile gate, nudges); `auto` doesn't.
 */
function startCalibration(reason: "auto" | "manual"): void {
  if (reason === "manual") {
    smoother.reset();
    smileGate.reset();
    nudges.reset();
    whistle.reset();
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
    setPaused(next);
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
      nudges.setOptions(configToNudgeOptions(config));
      whistle.setOptions({
        split1Hz: config.whistleSplit1Hz,
        split2Hz: config.whistleSplit2Hz,
        split3Hz: config.whistleSplit3Hz,
        minHz: config.whistleMinHz,
        maxHz: config.whistleMaxHz,
        minClarity: config.whistleClarity,
        holdMs: config.whistleHoldMs,
        repeatRateHz: config.whistleRepeatRateHz,
      });
      pitchDetector?.setRange(config.whistleMinHz, config.whistleMaxHz);
      dabDetector.setOptions({
        holdMs: config.dabHoldMs,
        cooldownMs: config.dabCooldownMs,
        minVisibility: 0.5,
      });
      break;
    case "calibrate":
      startCalibration("manual");
      break;
    case "toggle":
      if (tracker) {
        setPaused(!tracker.paused());
      }
      break;
    case "transcript-forward":
      setText("transcript", msg.text + (msg.isFinal ? "" : "…"));
      break;
    case "dictation-stop":
      if (msg.reason) {
        setBanner(msg.reason, "info");
      }
      void stopLocalDictation({ notifyHost: false, suppressUntilSmileDrops: true });
      break;
  }
});

window.addEventListener("beforeunload", () => {
  void stopLocalDictation({ notifyHost: true });
  tracker?.stop();
  bodyTracker?.stop();
  audioAnalyser?.stop();
  camera?.stop();
});

void init();
