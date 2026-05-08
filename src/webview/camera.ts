/** Open camera + microphone resources. `stop()` releases both tracks. */
export interface CameraHandle {
  stream: MediaStream;
  video: HTMLVideoElement;
  stop: () => void;
}

/**
 * Request camera + microphone permission, attach the video track to the given
 * `<video>` element, and return a handle for later cleanup. Resolves once the
 * video element has metadata and is playing.
 */
export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  video.srcObject = stream;
  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      reject(new Error("video element failed to load metadata"));
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
  await video.play();

  return {
    stream,
    video,
    stop: () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      video.srcObject = null;
    },
  };
}

/**
 * Map a `getUserMedia` error to a human-readable string suitable for an
 * error toast. Falls back to the underlying message for non-DOMException errors.
 */
export function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Camera permission denied. Grant Cursor access in System Settings → Privacy & Security → Camera.";
      case "NotFoundError":
        return "No camera detected.";
      case "NotReadableError":
        return "Camera is in use by another application.";
      case "OverconstrainedError":
        return "Camera does not support the requested resolution.";
    }
    return `Camera error: ${err.name}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
