import { WebSocket } from "ws";

/**
 * Construction parameters for {@link ElevenLabsSttClient}. The host owns the
 * API key — it never crosses into the webview.
 */
export interface ElevenLabsSttOptions {
  apiKey: string;
  languageCode: string;
  modelId: string;
  sampleRate: number;
  /** Fires for every transcript fragment. `isFinal` is true for committed transcripts. */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Fires on socket, parse, or transcription errors. */
  onError?: (err: Error) => void;
  /** Fires once when the underlying WebSocket closes. */
  onClose?: (code: number, reason: string) => void;
}

interface ElevenLabsEvent {
  message_type?: string;
  text?: unknown;
  error?: unknown;
  message?: unknown;
  detail?: unknown;
}

interface PendingAudio {
  buffer: ArrayBuffer;
  commit: boolean;
}

/**
 * Streaming ElevenLabs Scribe client. One instance corresponds to one
 * dictation session: call `start()` to open the socket, `sendAudio()` for each
 * 16-bit PCM chunk, `stop()` to commit the current segment and close.
 */
export class ElevenLabsSttClient {
  private ws: WebSocket | null = null;
  private buffered: PendingAudio[] = [];
  private pendingAudio: ArrayBuffer | null = null;
  private opened = false;
  private closed = false;
  private closeTimer: NodeJS.Timeout | undefined;

  constructor(private opts: ElevenLabsSttOptions) {}

  /**
   * Open the WebSocket. Audio sent before `OPEN` fires is buffered and
   * replayed once the connection is established. No-op if already started.
   */
  start(): void {
    if (this.ws) {
      return;
    }
    const params = new URLSearchParams({
      model_id: this.opts.modelId,
      audio_format: `pcm_${this.opts.sampleRate}`,
      commit_strategy: "manual",
    });
    if (this.opts.languageCode) {
      params.set("language_code", this.opts.languageCode);
    }
    const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
    const ws = new WebSocket(url, {
      headers: { "xi-api-key": this.opts.apiKey },
    });
    this.ws = ws;

    ws.on("open", () => {
      this.opened = true;
      for (const chunk of this.buffered) {
        this.sendAudioNow(ws, chunk.buffer, chunk.commit);
      }
      this.buffered = [];
    });

    ws.on("message", (data) => {
      try {
        const text = typeof data === "string" ? data : data.toString();
        this.handleMessage(JSON.parse(text) as ElevenLabsEvent);
      } catch (err) {
        this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    ws.on("error", (err) => {
      this.opts.onError?.(err);
    });

    ws.on("close", (code, reasonBuf) => {
      this.opened = false;
      this.closed = true;
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = undefined;
      }
      const reason = reasonBuf?.toString() ?? "";
      this.opts.onClose?.(code, reason);
      this.ws = null;
    });
  }

  /**
   * Forward one little-endian PCM16 chunk to ElevenLabs. Chunks arriving before
   * the socket opens are buffered. After `stop()` the call is a silent no-op.
   */
  sendAudio(buffer: ArrayBuffer): void {
    if (this.closed) {
      return;
    }
    if (this.pendingAudio) {
      this.queueOrSend(this.pendingAudio, false);
    }
    this.pendingAudio = buffer;
  }

  /**
   * Commit the current segment, give ElevenLabs a short window to return the
   * committed transcript, then close the socket. Idempotent.
   */
  stop(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const ws = this.ws;
    if (!ws) {
      this.buffered = [];
      this.pendingAudio = null;
      return;
    }
    try {
      if (this.opened) {
        if (this.pendingAudio) {
          this.sendAudioNow(ws, this.pendingAudio, true);
          this.pendingAudio = null;
        } else {
          this.sendAudioNow(ws, new ArrayBuffer(0), true);
        }
      }
    } catch {
      // ignore
    }
    this.buffered = [];
    this.pendingAudio = null;
    this.closeTimer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }, 1500);
  }

  private handleMessage(msg: ElevenLabsEvent): void {
    const type = msg.message_type;
    if (type === "partial_transcript" || type === "committed_transcript") {
      if (typeof msg.text === "string" && msg.text.length > 0) {
        this.opts.onTranscript(msg.text, type === "committed_transcript");
      }
      return;
    }
    if (type === "committed_transcript_with_timestamps") {
      return;
    }
    if (type && ELEVENLABS_ERROR_TYPES.has(type)) {
      this.opts.onError?.(new Error(this.errorText(msg)));
    }
  }

  private queueOrSend(buffer: ArrayBuffer, commit: boolean): void {
    if (!this.ws || !this.opened) {
      this.buffered.push({ buffer, commit });
      return;
    }
    this.sendAudioNow(this.ws, buffer, commit);
  }

  private sendAudioNow(ws: WebSocket, buffer: ArrayBuffer, commit: boolean): void {
    ws.send(JSON.stringify({
      message_type: "input_audio_chunk",
      audio_base_64: Buffer.from(buffer).toString("base64"),
      sample_rate: this.opts.sampleRate,
      commit,
    }));
  }

  private errorText(msg: ElevenLabsEvent): string {
    for (const value of [msg.error, msg.message, msg.detail]) {
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return msg.message_type ? `ElevenLabs ${msg.message_type}` : "ElevenLabs transcription error";
  }
}

const ELEVENLABS_ERROR_TYPES = new Set([
  "auth_error",
  "quota_exceeded",
  "transcriber_error",
  "input_error",
  "error",
  "commit_throttled",
  "unaccepted_terms",
  "rate_limited",
  "queue_overflow",
  "resource_exhausted",
  "session_time_limit_exceeded",
  "chunk_size_exceeded",
  "insufficient_audio_activity",
]);
