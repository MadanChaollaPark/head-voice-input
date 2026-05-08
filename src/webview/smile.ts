import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

/**
 * Compute a single smile intensity in [0, 1] from the Face Landmarker
 * blendshapes by averaging the left and right `mouthSmile` categories.
 * Returns 0 if no face was detected this frame.
 */
export function smileFromResult(result: FaceLandmarkerResult): number {
  const shapes = result.faceBlendshapes?.[0]?.categories;
  if (!shapes) {
    return 0;
  }
  let left = 0;
  let right = 0;
  for (const c of shapes) {
    if (c.categoryName === "mouthSmileLeft") {
      left = c.score;
    } else if (c.categoryName === "mouthSmileRight") {
      right = c.score;
    }
  }
  return (left + right) / 2;
}

/**
 * Hysteresis + hold-time configuration for {@link SmileGate}. The two
 * thresholds form a band that protects against rapid flicker around the
 * trigger point; hold times require the smile to remain past the threshold
 * for a sustained period before the gate flips.
 */
export interface SmileGateOptions {
  onThreshold: number;
  offThreshold: number;
  onHoldMs: number;
  offHoldMs: number;
}

/**
 * Two-state debounced gate. Call `update()` every frame; it returns whether
 * the active state changed this tick, allowing the caller to fire only on
 * transitions instead of on every active frame.
 */
export class SmileGate {
  private active = false;
  private aboveSince: number | null = null;
  private belowSince: number | null = null;

  constructor(private opts: SmileGateOptions) {}

  setOptions(opts: SmileGateOptions): void {
    this.opts = opts;
  }

  isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.active = false;
    this.aboveSince = null;
    this.belowSince = null;
  }

  /**
   * Feed the latest smile intensity. Returns `{ changed, active }`; `changed`
   * is true exactly on the frame where the gate flips on or off.
   */
  update(value: number, timestampMs: number): { changed: boolean; active: boolean } {
    const o = this.opts;
    if (!this.active) {
      if (value >= o.onThreshold) {
        this.aboveSince ??= timestampMs;
        if (timestampMs - this.aboveSince >= o.onHoldMs) {
          this.active = true;
          this.aboveSince = null;
          this.belowSince = null;
          return { changed: true, active: true };
        }
      } else {
        this.aboveSince = null;
      }
    } else {
      if (value <= o.offThreshold) {
        this.belowSince ??= timestampMs;
        if (timestampMs - this.belowSince >= o.offHoldMs) {
          this.active = false;
          this.aboveSince = null;
          this.belowSince = null;
          return { changed: true, active: false };
        }
      } else {
        this.belowSince = null;
      }
    }
    return { changed: false, active: this.active };
  }
}
