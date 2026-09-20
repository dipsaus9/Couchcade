/**
 * Gravity sign conventions (motion.md, "Sign conventions"). Some iPhones may report both
 * acceleration fields with the opposite sign to the W3C spec. That is unverified, so calibration
 * measures it instead of checking the platform.
 */
import type { MotionSample, Vec3 } from "../sensors/types.ts";
import { scale } from "./vector.ts";

/** Below this `|y + z|` in m/s² the pose is unclear and the sign decision isn't measured. */
export const SIGN_UNCLEAR_BAND = 2;

export interface SignDecision {
  inverted: boolean;
  /** `false` when the pose was unclear and `previous` (or W3C signs) was kept. */
  measured: boolean;
}

/**
 * Decides the gravity sign from one `gravityAcceleration` reading, as delivered (a still mean or a
 * single sample; both are just a vector to this function). The player is reading the screen, so
 * with W3C signs a portrait phone between flat and upright reads `y + z > 0`. A reading with
 * `y + z < −2` is inverted. With `|y + z| <= 2` (the phone is on its side) the previous decision
 * from this page session is kept, or W3C signs when there is none.
 */
export function detectSigns(
  meanGravity: Vec3,
  previous?: boolean,
  band: number = SIGN_UNCLEAR_BAND,
): SignDecision {
  const facing = meanGravity.y + meanGravity.z;
  if (facing < -band) return { inverted: true, measured: true };
  if (facing > band) return { inverted: false, measured: true };
  return { inverted: previous ?? false, measured: false };
}

export interface SignTracker {
  /** Feeds one `gravityAcceleration` reading and returns the decision after it. */
  push(gravity: Vec3): SignDecision;
  /** The decision as of the last `push`, without feeding a new reading. */
  current(): SignDecision;
  /** Starts over at the original `previous` decision. */
  reset(): void;
}

/**
 * Tracks the gravity sign for the whole session (motion.md, "Where aim's zero comes from
 * (CC-5.12)", recommendation point 4): the first sample outside the unclear band sets the
 * decision, and any later clear sample can correct it. No dedicated still window is needed --
 * `push` takes whatever reading calibration sees next, still or moving.
 */
export function createSignTracker(
  previous?: boolean,
  band: number = SIGN_UNCLEAR_BAND,
): SignTracker {
  const initial: SignDecision = { inverted: previous ?? false, measured: false };
  let decision = initial;
  return {
    push(gravity) {
      decision = detectSigns(gravity, decision.inverted, band);
      return decision;
    },
    current() {
      return decision;
    },
    reset() {
      decision = initial;
    },
  };
}

/**
 * The sample with W3C signs: both acceleration fields negated when `inverted`. The rotation rate is
 * never flipped (motion.md sign rule 4).
 */
export function applySigns(sample: MotionSample, inverted: boolean): MotionSample {
  if (!inverted) return sample;
  return {
    ...sample,
    acceleration: flip(sample.acceleration),
    gravityAcceleration: flip(sample.gravityAcceleration),
  };
}

const flip = (v: Vec3 | null): Vec3 | null => (v ? scale(v, -1) : null);
