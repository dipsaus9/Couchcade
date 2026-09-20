/**
 * Rest calibration (motion.md, "Rest calibration" and "Where aim's zero comes from (CC-5.12)"):
 * instead of one still second at the start of a game, this watches for stillness for the whole
 * session and re-measures the gyroscope bias and the gravity direction on every fresh still
 * stretch. Pure: time comes only from sample `t`, so traces replay exactly.
 *
 * ```ts
 * const rest = createRestCalibration();
 * const stop = adapter.start((sample) => {
 *   const calibration = rest.push(sample);
 *   if (calibration) useCalibration(calibration); // keeps improving on later still stretches
 * });
 * ```
 */
import type { MotionSample, RotationRate, Vec3 } from "../sensors/types.ts";
import { motionFrame, ZERO_RATE } from "./frame.ts";
import { createSignTracker, SIGN_UNCLEAR_BAND } from "./signs.ts";
import type { Calibration } from "./types.ts";
import { add, length, normalise, rateVector, scale, vec } from "./vector.ts";

export interface RestCalibrationOptions {
  /** How long a still stretch must last to count as measured, in ms. Defaults to 1,000. */
  stillMs?: number;
  /** Every rotation rate magnitude must stay under this, in deg/s. Defaults to 10. */
  maxRotationRate?: number;
  /** The gravity-including magnitude must stay within this of its running mean, in m/s². Defaults to 0.5. */
  maxMagnitudeDrift?: number;
  /**
   * If no still stretch has completed by this long, in ms, start returning the best estimate from
   * the most recent `fallbackMs` of samples instead of `null`. Never a zero bias: a short noisy
   * estimate is always preferred to none. Defaults to 5,000.
   */
  timeoutMs?: number;
  /** The fallback estimate's window, in ms. Defaults to 250. */
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
  /** `true` once at least one still stretch has completed and measured the bias for real. */
  calibrated: boolean;
}

export interface RestCalibration {
  /**
   * Feeds one sample, as the adapter delivered it. Keeps running for the whole session: every
   * fresh still stretch re-measures the bias and the gravity direction. Returns the current best
   * estimate -- a real still-stretch measurement once one has completed, otherwise the best
   * recent-average estimate so far (never a zero bias) -- or `null` before any estimate exists.
   * Samples without `gravityAcceleration` are skipped.
   */
  push(sample: MotionSample): Calibration | null;
  /** How far the current still stretch has got, for the hold-still fallback screen. */
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

/**
 * Starts a rest calibration that runs for the whole session. See motion.md, "Where aim's zero
 * comes from (CC-5.12)", for the reasoning and every default.
 */
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

  const signs = createSignTracker(previousInverted, signBand);

  let startT: number | null = null;
  let lastT = 0;
  let restarts = 0;
  let still: Reading[] = [];
  let magnitudeSum = 0;
  let recent: Reading[] = [];
  let best: Calibration | null = null;
  let calibrated = false;
  /** Whether the current still stretch has already produced a measurement (fires once per stretch). */
  let measuredThisStretch = false;

  const isTurning = (reading: Reading) =>
    reading.rate !== null && length(reading.rate) >= maxRotationRate;

  const finish = (readings: Reading[], timedOut: boolean): Calibration => {
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
    const signDecision = signs.current();
    // W3C signs: at rest the gravity-including acceleration points up. A zero mean has no
    // direction, so up falls back to the screen's normal.
    const up = normalise(scale(meanGravity, signDecision.inverted ? -1 : 1)) ?? vec(0, 0, 1);
    // Accelerometer-only phones have no rate readings at all, so zero is the correct bias, not an
    // unmeasured stand-in (motion.md, "Where aim's zero comes from", recommendation point 3).
    const meanRate = rates > 0 ? scale(rateSum, 1 / rates) : null;
    const bias: RotationRate = meanRate
      ? { alpha: meanRate.x, beta: meanRate.y, gamma: meanRate.z }
      : { ...ZERO_RATE };
    return {
      up,
      frame: motionFrame(up),
      bias,
      inverted: signDecision.inverted,
      signMeasured: signDecision.measured,
      timedOut,
      interval: median(readings.map((reading) => reading.interval)),
      t: lastT,
    };
  };

  return {
    push(sample) {
      const gravity = sample.gravityAcceleration;
      if (!gravity) return best;
      const reading: Reading = {
        t: sample.t,
        interval: sample.interval,
        gravity,
        rate: sample.rotationRate ? rateVector(sample.rotationRate) : null,
      };
      startT ??= reading.t;
      lastT = reading.t;

      // The sign is read from every sample, still or moving: it needs no stillness, just a clear
      // enough pose (signs.ts, `createSignTracker`).
      signs.push(gravity);

      // Still test: no turning, and the magnitude close to the running mean of this still stretch.
      const magnitude = length(gravity);
      const drifted =
        still.length > 0 && Math.abs(magnitude - magnitudeSum / still.length) > maxMagnitudeDrift;
      if (isTurning(reading) || drifted) {
        if (still.length > 0) restarts++;
        still = [];
        magnitudeSum = 0;
        measuredThisStretch = false;
      }
      if (!isTurning(reading)) {
        still.push(reading);
        magnitudeSum += magnitude;
      }

      recent.push(reading);
      while ((recent[0]?.t ?? reading.t) <= reading.t - fallbackMs) recent.shift();

      const first = still[0];
      if (first && !measuredThisStretch && reading.t - first.t >= stillMs) {
        // A fresh still stretch just crossed the threshold: re-measure for real, once.
        best = finish(still, false);
        calibrated = true;
        measuredThisStretch = true;
      } else if (!calibrated && reading.t - (startT ?? reading.t) >= timeoutMs) {
        // No still stretch yet and it's been a while: the best noisy estimate beats none at all.
        // Keeps refreshing from the latest window until a real still stretch replaces it.
        best = finish(recent, true);
      }
      return best;
    },

    progress() {
      const first = still[0];
      return {
        elapsedMs: startT === null ? 0 : lastT - startT,
        stillMs: first ? lastT - first.t : 0,
        restarts,
        calibrated,
      };
    },

    reset() {
      startT = null;
      lastT = 0;
      restarts = 0;
      still = [];
      magnitudeSum = 0;
      recent = [];
      best = null;
      calibrated = false;
      measuredThisStretch = false;
      signs.reset();
    },
  };
}

/**
 * Runs rest calibration over a list of samples, such as a trace, and returns the first estimate it
 * produces (a real still stretch, or the timeout fallback). `null` if neither ever happens within
 * the given samples.
 */
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
