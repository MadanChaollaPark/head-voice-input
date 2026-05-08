/**
 * Shared message and config types for the host <-> webview boundary.
 *
 * Both bundles import from this file, so any mismatch surfaces as a TypeScript
 * error in both directions. See `docs/data-flow.md` for the runtime contract.
 */

/** A discrete cursor or scroll direction emitted by the head-tilt controller. */
export type Direction = "up" | "down" | "left" | "right";

/** Webview -> host: one tilt-driven cursor or scroll move. */
export interface NudgeMessage {
  type: "nudge";
  direction: Direction;
}

/** Webview -> host: smile gate transitioned on (`active: true`) or off. */
export interface DictationStateMessage {
  type: "dictation";
  active: boolean;
}

/** Webview -> host: a transcript fragment emitted from inside the webview's own STT path (currently unused; transcripts come from the host). */
export interface TranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
}

/** Webview -> host: per-frame pose snapshot intended for future debug overlays. */
export interface PoseDebugMessage {
  type: "pose";
  yaw: number;
  pitch: number;
  smile: number;
}

/** Webview -> host: subtle status updates that don't deserve a toast. Reserved. */
export interface StatusMessage {
  type: "status";
  message: string;
}

/** Webview -> host: emitted once after the camera, tracker, and mic finish initializing. */
export interface ReadyMessage {
  type: "ready";
}

/** Webview -> host: human-readable error string; surfaces as a toast in the host. */
export interface ErrorMessage {
  type: "error";
  message: string;
}

/** Webview -> host: a `MediaRecorder` chunk during active dictation. The host forwards `data` to Deepgram. */
export interface AudioChunkMessage {
  type: "audio";
  data: ArrayBuffer;
  mimeType: string;
  first: boolean;
}

/** Webview -> host: defensive signal sent when `MediaRecorder.stop()` finishes; treated like `dictation: false`. */
export interface DictationEndMessage {
  type: "dictation-end";
}

/** Discriminated union of all messages flowing from webview to host. */
export type WebviewToHostMessage =
  | NudgeMessage
  | DictationStateMessage
  | TranscriptMessage
  | PoseDebugMessage
  | StatusMessage
  | ReadyMessage
  | ErrorMessage
  | AudioChunkMessage
  | DictationEndMessage;

/** Host -> webview: pushes the current `HeadInputConfig`. `deepgramKey` is always null (the key never leaves the host). */
export interface ConfigMessage {
  type: "config";
  config: HeadInputConfig;
  deepgramKey: string | null;
}

/** Host -> webview: triggers a fresh 1-second neutral-pose calibration. */
export interface CalibrateRequestMessage {
  type: "calibrate";
}

/** Host -> webview: pauses or resumes the per-frame detection loop without tearing down camera/mic. */
export interface ToggleRequestMessage {
  type: "toggle";
}

/** Host -> webview: a Deepgram transcript (interim or final) for display in the panel. */
export interface TranscriptForwardMessage {
  type: "transcript-forward";
  text: string;
  isFinal: boolean;
}

/** Discriminated union of all messages flowing from host to webview. */
export type HostToWebviewMessage =
  | ConfigMessage
  | CalibrateRequestMessage
  | ToggleRequestMessage
  | TranscriptForwardMessage;

/**
 * User-tunable runtime configuration. Mirrors the `headInput.*` keys in
 * `package.json`'s `contributes.configuration`. The host reads it via
 * `vscode.workspace.getConfiguration` and pushes a fresh copy to the webview
 * whenever any of these keys changes.
 */
export interface HeadInputConfig {
  /** Multiplier on raw yaw/pitch before the dead-zone comparison. */
  tiltSensitivity: number;
  /** Degrees of effective tilt ignored around neutral. */
  deadZoneDegrees: number;
  /** Repeat rate (Hz) for cursor moves while a tilt is held. */
  repeatRateHz: number;
  /** Whether pitch (head up/down) drives the caret or the viewport. */
  verticalAction: "cursor" | "scroll";
  /** Whether yaw (head left/right) moves by character or by word. */
  horizontalAction: "cursor" | "word";
  /** Smile blendshape average above which dictation arms (with hysteresis). */
  smileOnThreshold: number;
  /** Smile blendshape average below which dictation disarms (with hysteresis). */
  smileOffThreshold: number;
  /** Hold duration (ms) above `smileOnThreshold` before dictation begins. */
  smileOnHoldMs: number;
  /** Hold duration (ms) below `smileOffThreshold` before dictation ends. */
  smileOffHoldMs: number;
  /** BCP-47-ish language tag passed to Deepgram. */
  deepgramLanguage: string;
  /** Deepgram model name (e.g. `nova-3`). */
  deepgramModel: string;
  /** Whether whistle-to-direction is active. */
  whistleEnabled: boolean;
  /** Lower bound of the whistle frequency range (Hz). Pitches below are ignored. */
  whistleMinHz: number;
  /** Upper bound of the whistle frequency range (Hz). Pitches above are ignored. */
  whistleMaxHz: number;
  /** Boundary between the "down" and "left" bands (Hz). */
  whistleSplit1Hz: number;
  /** Boundary between the "left" and "right" bands (Hz). */
  whistleSplit2Hz: number;
  /** Boundary between the "right" and "up" bands (Hz). */
  whistleSplit3Hz: number;
  /** Minimum YIN clarity (0..1) before a sample is considered a whistle. */
  whistleClarity: number;
  /** How long a single band must be sustained before firing. */
  whistleHoldMs: number;
  /** Repeat rate (Hz) while a whistle is held in one band. */
  whistleRepeatRateHz: number;
}
