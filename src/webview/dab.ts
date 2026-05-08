import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Detector for the "dab" gesture: one arm extended high and out, the other
 * arm bent across the face, head leaning toward the bent arm. Mirror-symmetric;
 * either arm can be the extended one. Pose is debounced with a hold timer
 * and gated by a cooldown after firing so a sustained dab fires only once.
 */
export interface DabOptions {
  /** How long the dab pose must be held before the gesture fires. */
  holdMs: number;
  /** After firing, ignore further detections for this long. */
  cooldownMs: number;
  /** Minimum visibility (0..1) required for each used keypoint. */
  minVisibility: number;
}

/**
 * Standard MediaPipe Pose 33-keypoint indices we care about.
 * 0  = nose
 * 11 = left shoulder, 12 = right shoulder
 * 13 = left elbow,    14 = right elbow
 * 15 = left wrist,    16 = right wrist
 *
 * Note: "left" / "right" are anatomical (subject's body), not image-space.
 */

export class DabDetector {
  private startedAt: number | null = null;
  private firedAt: number | null = null;

  constructor(private opts: DabOptions) {}

  setOptions(opts: DabOptions): void {
    this.opts = opts;
  }

  reset(): void {
    this.startedAt = null;
    this.firedAt = null;
  }

  /**
   * Feed one frame's pose landmarks. Returns true *exactly* on the frame
   * the dab fires (after `holdMs` of sustained pose). After firing, won't
   * fire again until `cooldownMs` has elapsed.
   */
  update(landmarks: NormalizedLandmark[] | null, ts: number): boolean {
    if (this.firedAt !== null && ts - this.firedAt < this.opts.cooldownMs) {
      return false;
    }
    const isDab = landmarks ? this.isDabPose(landmarks) : false;
    if (!isDab) {
      this.startedAt = null;
      return false;
    }
    if (this.startedAt === null) {
      this.startedAt = ts;
      return false;
    }
    if (ts - this.startedAt >= this.opts.holdMs) {
      this.firedAt = ts;
      this.startedAt = null;
      return true;
    }
    return false;
  }

  /** True if a partial dab is currently being held (visualisable as armed). */
  arming(): boolean {
    return this.startedAt !== null;
  }

  private isDabPose(lm: NormalizedLandmark[]): boolean {
    if (lm.length < 17) return false;
    const [nose, lSh, rSh, lEl, rEl, lWr, rWr] = [
      lm[0], lm[11], lm[12], lm[13], lm[14], lm[15], lm[16],
    ];
    const minVis = this.opts.minVisibility;
    for (const p of [nose, lSh, rSh, lEl, rEl, lWr, rWr]) {
      if ((p.visibility ?? 1) < minVis) return false;
    }
    return (
      checkSide(lSh, lEl, lWr, rSh, rEl, rWr, nose) ||
      checkSide(rSh, rEl, rWr, lSh, lEl, lWr, nose)
    );
  }
}

/**
 * Test the dab predicate for a specific orientation: `ext*` is the arm
 * extended high-and-out, `bent*` is the arm folded across the face.
 */
function checkSide(
  extSh: NormalizedLandmark,
  extEl: NormalizedLandmark,
  extWr: NormalizedLandmark,
  bentSh: NormalizedLandmark,
  bentEl: NormalizedLandmark,
  bentWr: NormalizedLandmark,
  nose: NormalizedLandmark,
): boolean {
  const shoulderDist = Math.hypot(extSh.x - bentSh.x, extSh.y - bentSh.y);
  if (shoulderDist < 0.05) return false;

  // 1. Extended wrist well above its shoulder. Image y grows downward.
  if (extSh.y - extWr.y < 0.18) return false;

  // 2. Extended wrist clearly outside the torso laterally.
  const centerX = (extSh.x + bentSh.x) / 2;
  if (Math.abs(extWr.x - centerX) < shoulderDist * 1.1) return false;

  // 3. Extended elbow at or above its shoulder.
  if (extEl.y > extSh.y + 0.02) return false;

  // 4. Bent wrist near the face — within ~80% of shoulder width from nose.
  const wrToNose = Math.hypot(bentWr.x - nose.x, bentWr.y - nose.y);
  if (wrToNose > shoulderDist * 0.85) return false;

  // 5. Bent elbow roughly at shoulder height (rules out arms-down poses).
  if (Math.abs(bentEl.y - bentSh.y) > shoulderDist * 0.65) return false;

  return true;
}
