// Messages exchanged between extension host and webview.

export type Direction = "up" | "down" | "left" | "right";

export interface NudgeMessage {
  type: "nudge";
  direction: Direction;
}

export interface DictationStateMessage {
  type: "dictation";
  active: boolean;
}

export interface TranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
}

export interface PoseDebugMessage {
  type: "pose";
  yaw: number;
  pitch: number;
  smile: number;
}

export interface StatusMessage {
  type: "status";
  message: string;
}

export interface ReadyMessage {
  type: "ready";
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface AudioChunkMessage {
  type: "audio";
  data: ArrayBuffer;
  mimeType: string;
  first: boolean;
}

export interface DictationEndMessage {
  type: "dictation-end";
}

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

export interface ConfigMessage {
  type: "config";
  config: HeadInputConfig;
  deepgramKey: string | null;
}

export interface CalibrateRequestMessage {
  type: "calibrate";
}

export interface ToggleRequestMessage {
  type: "toggle";
}

export interface TranscriptForwardMessage {
  type: "transcript-forward";
  text: string;
  isFinal: boolean;
}

export type HostToWebviewMessage =
  | ConfigMessage
  | CalibrateRequestMessage
  | ToggleRequestMessage
  | TranscriptForwardMessage;

export interface HeadInputConfig {
  tiltSensitivity: number;
  deadZoneDegrees: number;
  repeatRateHz: number;
  verticalAction: "cursor" | "scroll";
  horizontalAction: "cursor" | "word";
  smileOnThreshold: number;
  smileOffThreshold: number;
  smileOnHoldMs: number;
  smileOffHoldMs: number;
  deepgramLanguage: string;
  deepgramModel: string;
}
