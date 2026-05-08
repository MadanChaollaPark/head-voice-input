/**
 * YIN pitch detector (de Cheveigné & Kawahara 2002), tuned for the
 * monophonic, near-sinusoidal signal of a whistle. Returns the fundamental
 * frequency in Hz plus a clarity score in [0, 1]; a `null` frequency means
 * no clear pitch was found.
 *
 * The algorithm:
 *   1. Difference function d(τ) = Σ (x[i] - x[i+τ])² over the window half.
 *   2. Cumulative mean normalized difference d'(τ).
 *   3. Absolute threshold: pick the smallest τ where d'(τ) < threshold,
 *      then walk down to the local minimum.
 *   4. Parabolic interpolation around that τ for sub-sample accuracy.
 */

export interface PitchResult {
  /** Detected fundamental frequency in Hz, or null if no clear pitch. */
  hz: number | null;
  /** YIN clarity in [0, 1]; closer to 1 means strongly periodic. */
  clarity: number;
}

export class PitchDetector {
  constructor(
    private sampleRate: number,
    private minHz = 500,
    private maxHz = 4000,
    private threshold = 0.15,
  ) {}

  setRange(minHz: number, maxHz: number): void {
    this.minHz = minHz;
    this.maxHz = maxHz;
  }

  detect(samples: Float32Array): PitchResult {
    const W = samples.length;
    const halfW = W >> 1;
    const minTau = Math.max(2, Math.floor(this.sampleRate / this.maxHz));
    const maxTau = Math.min(halfW, Math.floor(this.sampleRate / this.minHz));
    if (maxTau <= minTau) {
      return { hz: null, clarity: 0 };
    }

    const yin = new Float32Array(maxTau + 1);

    // 1. Difference function.
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let i = 0; i < halfW; i++) {
        const delta = samples[i] - samples[i + tau];
        sum += delta * delta;
      }
      yin[tau] = sum;
    }

    // 2. Cumulative mean normalized difference. yin[0] = 1 by definition.
    yin[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      runningSum += yin[tau];
      yin[tau] = runningSum > 0 ? (yin[tau] * tau) / runningSum : 1;
    }

    // 3. Absolute threshold within [minTau, maxTau].
    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (yin[tau] < this.threshold) {
        while (tau + 1 <= maxTau && yin[tau + 1] < yin[tau]) {
          tau++;
        }
        tauEstimate = tau;
        break;
      }
    }
    if (tauEstimate < 0) {
      return { hz: null, clarity: 0 };
    }

    // 4. Parabolic interpolation.
    let betterTau = tauEstimate;
    if (tauEstimate > minTau && tauEstimate < maxTau) {
      const s0 = yin[tauEstimate - 1];
      const s1 = yin[tauEstimate];
      const s2 = yin[tauEstimate + 1];
      const denom = 2 * (2 * s1 - s0 - s2);
      if (denom !== 0) {
        betterTau = tauEstimate + (s2 - s0) / denom;
      }
    }

    return {
      hz: this.sampleRate / betterTau,
      clarity: 1 - yin[tauEstimate],
    };
  }
}
