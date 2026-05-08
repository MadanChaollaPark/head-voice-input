import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export function poseFromResult(result: FaceLandmarkerResult): HeadPose | null {
  const matrix = result.facialTransformationMatrixes?.[0];
  if (!matrix || !matrix.data || matrix.data.length < 16) {
    return null;
  }
  const m = matrix.data;
  // Column-major 4x4. Column 2 (indices 8,9,10) is the head's forward vector
  // in camera space: +Z out of the face.
  const fx = m[8];
  const fy = m[9];
  const fz = m[10];
  const yaw = Math.atan2(fx, fz);
  const pitch = Math.atan2(-fy, Math.sqrt(fx * fx + fz * fz));
  // Roll from the projection of the head's right axis (column 0) onto the
  // camera plane. Sufficient for an indicator; not a strict Euler extraction.
  const rx = m[0];
  const ry = m[1];
  const roll = Math.atan2(ry, rx);
  return { yaw, pitch, roll };
}

// One-Euro filter (Casiez et al. 2012). Cheap, smooth, low-lag.
export class OneEuroFilter {
  private prev: number | null = null;
  private prevDeriv = 0;
  private prevTs: number | null = null;
  constructor(
    private minCutoff = 1.0,
    private beta = 0.0,
    private derivCutoff = 1.0,
  ) {}

  reset(): void {
    this.prev = null;
    this.prevDeriv = 0;
    this.prevTs = null;
  }

  filter(value: number, timestampMs: number): number {
    if (this.prev === null || this.prevTs === null) {
      this.prev = value;
      this.prevTs = timestampMs;
      return value;
    }
    const dt = Math.max((timestampMs - this.prevTs) / 1000, 1e-3);
    const deriv = (value - this.prev) / dt;
    const aDeriv = alpha(this.derivCutoff, dt);
    const smoothedDeriv = aDeriv * deriv + (1 - aDeriv) * this.prevDeriv;
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDeriv);
    const a = alpha(cutoff, dt);
    const out = a * value + (1 - a) * this.prev;
    this.prev = out;
    this.prevDeriv = smoothedDeriv;
    this.prevTs = timestampMs;
    return out;
  }
}

function alpha(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

export class PoseSmoother {
  private yawFilter = new OneEuroFilter(1.5, 0.05);
  private pitchFilter = new OneEuroFilter(1.5, 0.05);
  private rollFilter = new OneEuroFilter(1.5, 0.05);

  reset(): void {
    this.yawFilter.reset();
    this.pitchFilter.reset();
    this.rollFilter.reset();
  }

  smooth(pose: HeadPose, timestampMs: number): HeadPose {
    return {
      yaw: this.yawFilter.filter(pose.yaw, timestampMs),
      pitch: this.pitchFilter.filter(pose.pitch, timestampMs),
      roll: this.rollFilter.filter(pose.roll, timestampMs),
    };
  }
}

export function radToDeg(r: number): number {
  return (r * 180) / Math.PI;
}
