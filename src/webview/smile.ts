import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

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

export interface SmileGateOptions {
  onThreshold: number;
  offThreshold: number;
  onHoldMs: number;
  offHoldMs: number;
}

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

  // Returns true if the active state changed this tick.
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
