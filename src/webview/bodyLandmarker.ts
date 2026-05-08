import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

/** MediaPipe-hosted Pose Landmarker (lite) task asset. CSP whitelists this origin. */
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

/**
 * Inputs for {@link startBodyTracker}. `everyN` throttles inference — pose
 * detection is heavier than face landmarks, and dab gestures are held for
 * 200+ ms, so 10–15 Hz is plenty.
 */
export interface BodyTrackerOptions {
  video: HTMLVideoElement;
  wasmRoot: string;
  /** Run pose detection every Nth frame. Default 2. */
  everyN?: number;
  onResult: (result: PoseLandmarkerResult, timestampMs: number) => void;
  onError?: (err: unknown) => void;
}

export interface BodyTrackerHandle {
  stop: () => void;
}

/**
 * Initialize the Pose Landmarker (GPU delegate, single-pose) and start a
 * `requestAnimationFrame` loop that calls `detectForVideo` on every Nth
 * frame. Timestamps are clamped to remain strictly monotonic.
 */
export async function startBodyTracker(opts: BodyTrackerOptions): Promise<BodyTrackerHandle> {
  const fileset = await FilesetResolver.forVisionTasks(opts.wasmRoot);
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  const everyN = Math.max(1, opts.everyN ?? 2);
  let stopped = false;
  let lastTs = -1;
  let frameIndex = 0;

  const loop = () => {
    if (stopped) {
      return;
    }
    if (opts.video.readyState >= 2 && frameIndex % everyN === 0) {
      const ts = performance.now();
      const safeTs = ts <= lastTs ? lastTs + 1 : ts;
      lastTs = safeTs;
      try {
        const result = landmarker.detectForVideo(opts.video, safeTs);
        opts.onResult(result, safeTs);
      } catch (err) {
        opts.onError?.(err);
      }
    }
    frameIndex++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  return {
    stop: () => {
      stopped = true;
      landmarker.close();
    },
  };
}
