const TARGET_SAMPLE_RATE = 16000;
const CHUNK_MS = 250;

/**
 * One audio fragment from the microphone. `data` is mono 16-bit PCM,
 * little-endian, resampled to 16 kHz for ElevenLabs Scribe realtime STT.
 */
export interface MicChunk {
  data: ArrayBuffer;
  mimeType: "audio/pcm;rate=16000";
  first: boolean;
}

/**
 * Web Audio based recorder that converts the camera stream's audio track into
 * fixed-size PCM16 chunks. A ScriptProcessor keeps the extension self-contained
 * inside the VS Code webview; the chunking and resampling are deterministic.
 */
export class MicRecorder {
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private pending: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private firstChunk = true;

  constructor(private sourceStream: MediaStream, private onChunk: (chunk: MicChunk) => void) {}

  isActive(): boolean {
    return this.audioContext !== null;
  }

  start(): void {
    if (this.audioContext) {
      return;
    }
    const audioTracks = this.sourceStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("no audio tracks in source MediaStream");
    }
    this.audioStream = new MediaStream(audioTracks);
    const AudioContextCtor = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("Web Audio API is not available in this webview");
    }
    const context = new AudioContextCtor();
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
    const source = context.createMediaStreamSource(this.audioStream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const chunkSamples = Math.round((TARGET_SAMPLE_RATE * CHUNK_MS) / 1000);

    this.pending = new Float32Array(0);
    this.firstChunk = true;
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const resampled = resampleLinear(input, context.sampleRate, TARGET_SAMPLE_RATE);
      this.pending = concatFloat32(this.pending, resampled);
      while (this.pending.length >= chunkSamples) {
        const chunk = this.pending.slice(0, chunkSamples);
        this.pending = this.pending.slice(chunkSamples);
        this.emit(chunk);
      }
    };

    source.connect(processor);
    processor.connect(context.destination);
    this.audioContext = context;
    this.source = source;
    this.processor = processor;
  }

  async stop(): Promise<void> {
    const context = this.audioContext;
    if (!context) {
      return;
    }
    const source = this.source;
    const processor = this.processor;
    this.audioContext = null;
    this.audioStream = null;
    this.source = null;
    this.processor = null;
    try {
      processor?.disconnect();
      source?.disconnect();
    } catch {
      // ignore
    }
    if (this.pending.length > 0) {
      this.emit(this.pending);
      this.pending = new Float32Array(0);
    }
    await context.close().catch(() => undefined);
  }

  private emit(samples: Float32Array): void {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    const wasFirst = this.firstChunk;
    this.firstChunk = false;
    this.onChunk({
      data: pcm.buffer,
      mimeType: "audio/pcm;rate=16000",
      first: wasFirst,
    });
  }
}

interface WebkitAudioWindow {
  webkitAudioContext?: typeof AudioContext;
}

function resampleLinear(
  input: Float32Array<ArrayBufferLike>,
  inputRate: number,
  outputRate: number,
): Float32Array<ArrayBufferLike> {
  if (inputRate === outputRate) {
    return input.slice();
  }
  const outputLength = Math.max(1, Math.round((input.length * outputRate) / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;
  for (let i = 0; i < outputLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const weight = pos - left;
    output[i] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

function concatFloat32(
  a: Float32Array<ArrayBufferLike>,
  b: Float32Array<ArrayBufferLike>,
): Float32Array<ArrayBufferLike> {
  if (a.length === 0) {
    return b;
  }
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
