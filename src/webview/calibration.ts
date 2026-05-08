import type { HeadPose } from "./pose";

/** Lifecycle of the {@link Calibrator}: not started, sampling, finished. */
export type CalibrationState = "idle" | "collecting" | "ready";

/**
 * One-shot neutral-pose calibrator. Call `begin()` to start a sampling
 * window, feed every frame's pose through `offer()`, then once the window
 * closes, `apply()` returns the pose relative to the captured neutral.
 */
export class Calibrator {
  private neutral: HeadPose | null = null;
  private state: CalibrationState = "idle";
  private samples: HeadPose[] = [];
  private startTs = 0;
  private durationMs = 1000;
  private onComplete: ((neutral: HeadPose) => void) | null = null;
  private onProgress: ((fraction: number) => void) | null = null;

  /**
   * Start a fresh calibration window. Defaults to 1000 ms; the calibrator
   * collects pose samples until the window closes and at least five samples
   * have arrived, then averages them to produce the neutral.
   */
  begin(opts: {
    durationMs?: number;
    onComplete?: (neutral: HeadPose) => void;
    onProgress?: (fraction: number) => void;
  } = {}): void {
    this.durationMs = opts.durationMs ?? 1000;
    this.onComplete = opts.onComplete ?? null;
    this.onProgress = opts.onProgress ?? null;
    this.state = "collecting";
    this.samples = [];
    this.startTs = 0;
  }

  reset(): void {
    this.neutral = null;
    this.state = "idle";
    this.samples = [];
    this.startTs = 0;
  }

  getState(): CalibrationState {
    return this.state;
  }

  hasNeutral(): boolean {
    return this.neutral !== null;
  }

  /** Feed one pose sample. No-op outside the `collecting` state. */
  offer(pose: HeadPose, timestampMs: number): void {
    if (this.state !== "collecting") {
      return;
    }
    if (this.startTs === 0) {
      this.startTs = timestampMs;
    }
    this.samples.push(pose);
    const elapsed = timestampMs - this.startTs;
    this.onProgress?.(Math.min(elapsed / this.durationMs, 1));
    if (elapsed >= this.durationMs && this.samples.length >= 5) {
      const n = this.samples.length;
      let yaw = 0;
      let pitch = 0;
      let roll = 0;
      for (const s of this.samples) {
        yaw += s.yaw;
        pitch += s.pitch;
        roll += s.roll;
      }
      this.neutral = { yaw: yaw / n, pitch: pitch / n, roll: roll / n };
      this.state = "ready";
      const cb = this.onComplete;
      this.onComplete = null;
      this.onProgress = null;
      cb?.(this.neutral);
    }
  }

  /** Subtract the captured neutral from `pose`. Pass-through if no neutral yet. */
  apply(pose: HeadPose): HeadPose {
    if (!this.neutral) {
      return pose;
    }
    return {
      yaw: pose.yaw - this.neutral.yaw,
      pitch: pose.pitch - this.neutral.pitch,
      roll: pose.roll - this.neutral.roll,
    };
  }
}
