/**
 * One audio fragment from `MediaRecorder`. The `first: true` chunk includes
 * the container header and must precede any subsequent chunk for Deepgram to
 * parse the stream.
 */
export interface MicChunk {
  data: ArrayBuffer;
  mimeType: string;
  first: boolean;
}

/**
 * Thin wrapper around `MediaRecorder` that picks a Deepgram-friendly mime
 * type and converts each blob to an `ArrayBuffer` for `postMessage` transfer.
 * Audio tracks are isolated from the source `MediaStream` so the video track
 * isn't touched.
 */
export class MicRecorder {
  private recorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private firstChunk = true;

  constructor(private source: MediaStream, private onChunk: (chunk: MicChunk) => void) {}

  isActive(): boolean {
    return this.recorder !== null;
  }

  start(): void {
    if (this.recorder) {
      return;
    }
    const audioTracks = this.source.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("no audio tracks in source MediaStream");
    }
    this.audioStream = new MediaStream(audioTracks);
    const mimeType = pickMimeType();
    this.firstChunk = true;
    const recorder = new MediaRecorder(this.audioStream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) {
        return;
      }
      const buffer = await event.data.arrayBuffer();
      const wasFirst = this.firstChunk;
      this.firstChunk = false;
      this.onChunk({
        data: buffer,
        mimeType: recorder.mimeType || "audio/webm",
        first: wasFirst,
      });
    };
    recorder.start(250);
    this.recorder = recorder;
  }

  stop(): void {
    const r = this.recorder;
    if (!r) {
      return;
    }
    r.ondataavailable = null;
    try {
      if (r.state !== "inactive") {
        r.stop();
      }
    } catch {
      // ignore
    }
    this.recorder = null;
    this.audioStream = null;
  }
}

/**
 * Choose the most-preferred mime type the current `MediaRecorder` supports,
 * walking from `audio/webm;codecs=opus` down to `audio/mp4`. Returns `null`
 * if none match — the recorder will then use its implementation default.
 */
function pickMimeType(): string | null {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return null;
}
