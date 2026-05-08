import { WebSocket } from "ws";

/**
 * Construction parameters for {@link DeepgramClient}. The host owns the API
 * key — it never crosses into the webview.
 */
export interface DeepgramOptions {
  apiKey: string;
  language: string;
  model: string;
  /** Fires for every transcript fragment. `isFinal` matches Deepgram's `is_final`. */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Fires on socket or parse errors. */
  onError?: (err: Error) => void;
  /** Fires once when the underlying WebSocket closes. */
  onClose?: (code: number, reason: string) => void;
}

/**
 * Streaming Deepgram client. One instance corresponds to one dictation
 * session: call `start()` to open the socket, `sendAudio()` for each chunk,
 * `stop()` to flush and close. The class is designed to be swappable — see
 * `docs/deepgram.md#switching-providers`.
 */
export class DeepgramClient {
  private ws: WebSocket | null = null;
  private buffered: ArrayBuffer[] = [];
  private opened = false;
  private closed = false;

  constructor(private opts: DeepgramOptions) {}

  /**
   * Open the WebSocket. Audio sent before `OPEN` fires is buffered and
   * replayed once the connection is established. No-op if already started.
   */
  start(): void {
    if (this.ws) {
      return;
    }
    const params = new URLSearchParams({
      model: this.opts.model,
      language: this.opts.language,
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
      endpointing: "300",
      vad_events: "true",
    });
    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    const ws = new WebSocket(url, {
      headers: { Authorization: `Token ${this.opts.apiKey}` },
    });
    this.ws = ws;

    ws.on("open", () => {
      this.opened = true;
      for (const chunk of this.buffered) {
        ws.send(chunk);
      }
      this.buffered = [];
    });

    ws.on("message", (data) => {
      try {
        const text = typeof data === "string" ? data : data.toString();
        const msg = JSON.parse(text);
        if (msg.type === "Results") {
          const alt = msg.channel?.alternatives?.[0];
          if (alt && typeof alt.transcript === "string" && alt.transcript.length > 0) {
            const isFinal = Boolean(msg.is_final);
            this.opts.onTranscript(alt.transcript, isFinal);
          }
        }
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
      const reason = reasonBuf?.toString() ?? "";
      this.opts.onClose?.(code, reason);
      this.ws = null;
    });
  }

  /**
   * Forward one audio chunk to Deepgram. Chunks arriving before the socket
   * opens are buffered. After `stop()` the call is a silent no-op.
   */
  sendAudio(buffer: ArrayBuffer): void {
    if (this.closed) {
      return;
    }
    if (!this.ws || !this.opened) {
      this.buffered.push(buffer);
      return;
    }
    this.ws.send(Buffer.from(buffer));
  }

  /**
   * Send Deepgram's `CloseStream` control message so it flushes a final
   * transcript, then close the socket. Subsequent `sendAudio` calls become
   * no-ops. Idempotent.
   */
  stop(): void {
    if (!this.ws) {
      this.closed = true;
      return;
    }
    try {
      // Tell Deepgram we are done; it will flush a final transcript.
      if (this.opened) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch {
      // ignore
    }
    try {
      this.ws.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.closed = true;
  }
}
