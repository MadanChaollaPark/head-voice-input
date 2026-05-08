import type { Direction } from "../types";
import type { HeadPose } from "./pose";

/**
 * Internal options for {@link NudgeController}. Use {@link configToNudgeOptions}
 * to derive these from a `HeadInputConfig`.
 */
export interface NudgeOptions {
  /** Radians of effective tilt that count as "active" past neutral. */
  deadZoneRad: number;
  /** Radians inside which a held tilt counts as released. Typically half the dead zone. */
  releaseRad: number;
  /** Repeat rate (Hz) for held tilts. */
  repeatRateHz: number;
  /** Multiplier applied to raw yaw/pitch before the dead-zone comparison. */
  sensitivity: number;
}

interface AxisState {
  active: 0 | 1 | -1;
  lastEmit: number;
}

/**
 * Two-axis stateful controller. Each frame, `update()` returns zero or more
 * directions that should be emitted as nudges this tick. State machine per
 * axis: idle -> active(+/-) on first crossing, repeats while held, returns
 * to idle when the head re-enters the release zone.
 */
export class NudgeController {
  private yaw: AxisState = { active: 0, lastEmit: 0 };
  private pitch: AxisState = { active: 0, lastEmit: 0 };

  constructor(private opts: NudgeOptions) {}

  setOptions(opts: NudgeOptions): void {
    this.opts = opts;
  }

  reset(): void {
    this.yaw = { active: 0, lastEmit: 0 };
    this.pitch = { active: 0, lastEmit: 0 };
  }

  /**
   * Feed the latest calibrated pose. Returns an array of directions to emit;
   * commonly empty, sometimes one entry, occasionally two (yaw + pitch
   * crossing thresholds simultaneously).
   */
  update(pose: HeadPose, timestampMs: number): Direction[] {
    const eff = {
      yaw: pose.yaw * this.opts.sensitivity,
      pitch: pose.pitch * this.opts.sensitivity,
    };
    return [
      ...this.evalAxis(this.yaw, eff.yaw, timestampMs, "right", "left"),
      ...this.evalAxis(this.pitch, eff.pitch, timestampMs, "up", "down"),
    ];
  }

  private evalAxis(
    state: AxisState,
    value: number,
    ts: number,
    posDir: Direction,
    negDir: Direction,
  ): Direction[] {
    const out: Direction[] = [];
    const dir = value > this.opts.deadZoneRad ? 1 : value < -this.opts.deadZoneRad ? -1 : 0;
    if (state.active === 0) {
      if (dir !== 0) {
        state.active = dir;
        state.lastEmit = ts;
        out.push(dir > 0 ? posDir : negDir);
      }
      return out;
    }
    if (Math.abs(value) < this.opts.releaseRad) {
      state.active = 0;
      return out;
    }
    if (dir !== 0 && dir !== state.active) {
      state.active = dir;
      state.lastEmit = ts;
      out.push(dir > 0 ? posDir : negDir);
      return out;
    }
    if (dir === state.active) {
      const interval = 1000 / Math.max(this.opts.repeatRateHz, 0.5);
      if (ts - state.lastEmit >= interval) {
        state.lastEmit = ts;
        out.push(dir > 0 ? posDir : negDir);
      }
    }
    return out;
  }
}

/**
 * Translate the user-facing `HeadInputConfig` shape into the internal
 * radian-based options consumed by {@link NudgeController}. The release zone
 * is set to half the dead zone for a comfortable hysteresis margin.
 */
export function configToNudgeOptions(config: {
  deadZoneDegrees: number;
  repeatRateHz: number;
  tiltSensitivity: number;
}): NudgeOptions {
  const deadZoneRad = (config.deadZoneDegrees * Math.PI) / 180;
  return {
    deadZoneRad,
    releaseRad: deadZoneRad * 0.5,
    repeatRateHz: config.repeatRateHz,
    sensitivity: config.tiltSensitivity,
  };
}
