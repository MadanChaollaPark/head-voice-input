import type { Direction } from "../types";

/**
 * Maps a detected whistle pitch to one of four directions by frequency
 * band, with a hold-time gate (analogous to {@link SmileGate}) and
 * repeat-on-hold (analogous to {@link NudgeController}).
 *
 * Three split frequencies (`split1Hz` < `split2Hz` < `split3Hz`) divide the
 * whistle range into four bands. Lowest band → "down", highest → "up";
 * the two middle bands map to "left" and "right" respectively.
 */
export interface WhistleOptions {
  split1Hz: number;
  split2Hz: number;
  split3Hz: number;
  minHz: number;
  maxHz: number;
  /** Minimum YIN clarity to accept a sample (0..1). */
  minClarity: number;
  /** How long a single band must be sustained before the first emit. */
  holdMs: number;
  /** Repeat rate (Hz) while the band is held. */
  repeatRateHz: number;
}

type Band = Direction | "none";

export class WhistleController {
  private band: Band = "none";
  private bandSince = 0;
  private fired = false;
  private lastEmit = 0;

  constructor(private opts: WhistleOptions) {}

  setOptions(opts: WhistleOptions): void {
    this.opts = opts;
  }

  reset(): void {
    this.band = "none";
    this.bandSince = 0;
    this.fired = false;
    this.lastEmit = 0;
  }

  currentBand(): Direction | null {
    return this.band === "none" ? null : this.band;
  }

  /**
   * Feed one pitch sample. Pass `hz=null` for unvoiced frames. Returns
   * directions to emit this tick — typically empty, occasionally one entry.
   */
  update(hz: number | null, clarity: number, ts: number): Direction[] {
    const o = this.opts;
    const band = this.classify(hz, clarity);

    if (band !== this.band) {
      this.band = band;
      this.bandSince = ts;
      this.fired = false;
      this.lastEmit = 0;
      return [];
    }

    if (band === "none") {
      return [];
    }

    if (!this.fired) {
      if (ts - this.bandSince >= o.holdMs) {
        this.fired = true;
        this.lastEmit = ts;
        return [band];
      }
      return [];
    }

    const interval = 1000 / Math.max(o.repeatRateHz, 0.5);
    if (ts - this.lastEmit >= interval) {
      this.lastEmit = ts;
      return [band];
    }
    return [];
  }

  private classify(hz: number | null, clarity: number): Band {
    const o = this.opts;
    if (hz === null || clarity < o.minClarity || hz < o.minHz || hz > o.maxHz) {
      return "none";
    }
    if (hz < o.split1Hz) return "down";
    if (hz < o.split2Hz) return "left";
    if (hz < o.split3Hz) return "right";
    return "up";
  }
}
