/**
 * Tap a Web Audio `AnalyserNode` off the camera's `MediaStream`. The
 * analyser is intentionally not connected to `ctx.destination` — that would
 * route the microphone to the speakers. `MediaRecorder` can read the same
 * stream simultaneously (audio is fan-out at the source).
 */

export interface AudioAnalyserHandle {
  /** Copy the most recent time-domain samples into the provided buffer. */
  read: (buffer: Float32Array) => void;
  /** Sample rate of the underlying `AudioContext`. */
  sampleRate: number;
  /** Number of samples available per `read()` call (== `fftSize`). */
  bufferSize: number;
  stop: () => void;
}

export async function startAudioAnalyser(stream: MediaStream): Promise<AudioAnalyserHandle> {
  const ctx = new AudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  return {
    read: (buf) => analyser.getFloatTimeDomainData(buf),
    sampleRate: ctx.sampleRate,
    bufferSize: analyser.fftSize,
    stop: () => {
      try {
        source.disconnect();
      } catch {
        // ignore
      }
      try {
        analyser.disconnect();
      } catch {
        // ignore
      }
      void ctx.close();
    },
  };
}
