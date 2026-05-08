import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

/** MediaPipe-hosted Face Landmarker task asset. CSP whitelists this origin. */
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/**
 * Inputs for {@link startTracker}. `wasmRoot` must point to a directory that
 * `webview.asWebviewUri` can serve from `dist/wasm/`.
 */
export interface TrackerOptions {
  video: HTMLVideoElement;
  wasmRoot: string;
  /** Fires once per frame with the landmarker's result. */
  onResult: (result: FaceLandmarkerResult, timestampMs: number) => void;
  /** Fires for non-fatal per-frame errors. */
  onError?: (err: unknown) => void;
}

/** Handle for the running detection loop. */
export interface TrackerHandle {
  /** Stop the loop and dispose the underlying landmarker. */
  stop: () => void;
  paused: () => boolean;
  /** Pause or resume per-frame detection without tearing down the landmarker. */
  setPaused: (value: boolean) => void;
}

/**
 * Initialize the Face Landmarker (GPU delegate, blendshapes + transformation
 * matrixes enabled) and start a `requestAnimationFrame` loop that calls
 * `detectForVideo` on each frame. Timestamps are clamped to remain strictly
 * monotonic — `detectForVideo` rejects duplicates.
 */
export async function startTracker(opts: TrackerOptions): Promise<TrackerHandle> {
  const fileset = await FilesetResolver.forVisionTasks(opts.wasmRoot);
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  });

  let stopped = false;
  let paused = false;
  let lastTs = -1;

  const loop = () => {
    if (stopped) {
      return;
    }
    if (!paused && opts.video.readyState >= 2) {
      const ts = performance.now();
      // detectForVideo requires monotonically-increasing timestamps.
      const safeTs = ts <= lastTs ? lastTs + 1 : ts;
      lastTs = safeTs;
      try {
        const result = landmarker.detectForVideo(opts.video, safeTs);
        opts.onResult(result, safeTs);
      } catch (err) {
        opts.onError?.(err);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  return {
    stop: () => {
      stopped = true;
      landmarker.close();
    },
    paused: () => paused,
    setPaused: (value: boolean) => {
      paused = value;
    },
  };
}
