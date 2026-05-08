import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface TrackerOptions {
  video: HTMLVideoElement;
  wasmRoot: string;
  onResult: (result: FaceLandmarkerResult, timestampMs: number) => void;
  onError?: (err: unknown) => void;
}

export interface TrackerHandle {
  stop: () => void;
  paused: () => boolean;
  setPaused: (value: boolean) => void;
}

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
