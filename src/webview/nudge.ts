import type { Direction } from "../types";
import type { HeadPose } from "./pose";

export interface NudgeOptions {
  deadZoneRad: number;
  releaseRad: number;
  repeatRateHz: number;
  sensitivity: number;
}

interface AxisState {
  active: 0 | 1 | -1;
  lastEmit: number;
}

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
