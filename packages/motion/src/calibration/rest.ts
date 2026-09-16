/**
 * Rest calibration (motion.md, "Rest calibration"): one second of holding still before each motion
 * game finds up, measures the gyroscope bias and detects the gravity sign. Pure: time comes only
 * from sample `t`, so traces replay exactly.
 *
 * ```ts
 * const rest = createRestCalibration({ previousInverted });
 * const stop = adapter.start((sample) => {
 *   const calibration = rest.push(sample);
 *   if (calibration) { stop(); startGame(calibration); }
 * });
 * ```
 */
import type { MotionSample, RotationRate, Vec3 } from "../sensors/types.ts";
import { motionFrame, ZERO_RATE } from "./frame.ts";
import { detectSigns, SIGN_UNCLEAR_BAND } from "./signs.ts";
import type { Calibration } from "./types.ts";
import { add, length, normalise, rateVector, scale, vec } from "./vector.ts";

export interface RestCalibrationOptions {
  /** How long the phone must stay still, in ms. Defaults to 1,000. */
  stillMs?: number;
  /** Every rotation rate magnitude must stay under this, in deg/s. Defaults to 10. */
  maxRotationRate?: number;
  /** The gravity-including magnitude must stay within this of its running mean, in m/s². Defaults to 0.5. */
  maxMagnitudeDrift?: number;
  /** Give up waiting for a still second after this long, in ms. Defaults to 5,000. */
  timeoutMs?: number;
  /** On timeout, average this much of the latest data, in ms. Defaults to 250. */
  fallbackMs?: number;
  /** The unclear `|y + z|` band for the sign decision, in m/s². Defaults to 2. */
  signBand?: number;
  /** The sign decision from an earlier calibration in this page session, kept when the pose is unclear. */
  previousInverted?: boolean;
}

export interface RestProgress {
  /** ms since the first usable sample. */
  elapsedMs: number;
  /** ms the phone has been still without a break. Drops back to 0 when it moves. */
  stillMs: number;
  /** How many times movement broke a still stretch. */
  restarts: number;
}

export interface RestCalibration {
  /**
   * Feeds one sample, as the adapter delivered it. Returns the calibration once a still second has
   * passed or the timeout hit, and the same calibration for every later sample. `null` until then.
   * Samples without `gravityAcceleration` are skipped.
   */
  push(sample: MotionSample): Calibration | null;
  /** How far calibration has got, for the "Hold your phone still" screen. */
  progress(): RestProgress;
  /** Starts over, as before the first sample. */
  reset(): void;
}

type Reading = { t: number; interval: number; gravity: Vec3; rate: Vec3 | null };

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** Starts a rest calibration. See motion.md, "Rest calibration", for every default. */
export function createRestCalibration(options: RestCalibrationOptions = {}): RestCalibration {
  const {
    stillMs = 1000,
    maxRotationRate = 10,
    maxMagnitudeDrift = 0.5,
    timeoutMs = 5000,
    fallbackMs = 250,
    signBand = SIGN_UNCLEAR_BAND,
    previousInverted,
  } = options;

  let startT: number | null = null;
  let lastT = 0;
  let restarts = 0;
  let still: Reading[] = [];
  let magnitudeSum = 0;
  let recent: Reading[] = [];
  let result: Calibration | null = null;

  const isTurning = (reading: Reading) =>
    reading.rate !== null && length(reading.rate) >= maxRotationRate;

  const finish = (readings: Reading[], useBias: boolean, timedOut: boolean): Calibration => {
    const n = readings.length;
    let gravitySum = vec(0, 0, 0);
    let rateSum = vec(0, 0, 0);
    let rates = 0;
    for (const reading of readings) {
      gravitySum = add(gravitySum, reading.gravity);
      if (reading.rate) {
        rateSum = add(rateSum, reading.rate);
        rates++;
      }
    }
    const meanGravity = scale(gravitySum, 1 / n);
    const signs = detectSigns(meanGravity, previousInverted, signBand);
    // W3C signs: at rest the gravity-including acceleration points up. A zero mean has no
    // direction, so up falls back to the screen's normal.
    const up = normalise(scale(meanGravity, signs.inverted ? -1 : 1)) ?? vec(0, 0, 1);
    const meanRate = useBias && rates > 0 ? scale(rateSum, 1 / rates) : null;
    const bias: RotationRate = meanRate
      ? { alpha: meanRate.x, beta: meanRate.y, gamma: meanRate.z }
      : { ...ZERO_RATE };
    return {
      up,
      frame: motionFrame(up),
      bias,
      inverted: signs.inverted,
      signMeasured: signs.measured,
      timedOut,
      interval: median(readings.map((reading) => reading.interval)),
      t: lastT,
    };
  };

  return {
    push(sample) {
      if (result) return result;
      const gravity = sample.gravityAcceleration;
      if (!gravity) return null;
      const reading: Reading = {
        t: sample.t,
        interval: sample.interval,
        gravity,
        rate: sample.rotationRate ? rateVector(sample.rotationRate) : null,
      };
      startT ??= reading.t;
      lastT = reading.t;

      // Still test: no turning, and the magnitude close to the running mean of this still stretch.
      const magnitude = length(gravity);
      const drifted =
        still.length > 0 && Math.abs(magnitude - magnitudeSum / still.length) > maxMagnitudeDrift;
      if (isTurning(reading) || drifted) {
        if (still.length > 0) restarts++;
        still = [];
        magnitudeSum = 0;
      }
      if (!isTurning(reading)) {
        still.push(reading);
        magnitudeSum += magnitude;
      }

      recent.push(reading);
      while ((recent[0]?.t ?? reading.t) <= reading.t - fallbackMs) recent.shift();

      const first = still[0];
      if (first && reading.t - first.t >= stillMs) {
        result = finish(still, true, false);
      } else if (reading.t - startT >= timeoutMs) {
        result = finish(recent, false, true);
      }
      return result;
    },

    progress() {
      const first = still[0];
      return {
        elapsedMs: startT === null ? 0 : lastT - startT,
        stillMs: first ? lastT - first.t : 0,
        restarts,
      };
    },

    reset() {
      startT = null;
      lastT = 0;
      restarts = 0;
      still = [];
      magnitudeSum = 0;
      recent = [];
      result = null;
    },
  };
}

/** Runs rest calibration over a list of samples, such as a trace. `null` if it never completes. */
export function calibrateRest(
  samples: Iterable<MotionSample>,
  options?: RestCalibrationOptions,
): Calibration | null {
  const rest = createRestCalibration(options);
  for (const sample of samples) {
    const calibration = rest.push(sample);
    if (calibration) return calibration;
  }
  return null;
}
