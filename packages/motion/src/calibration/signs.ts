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
 * Decides the gravity sign from the still mean of `gravityAcceleration`, as delivered. The player is
 * reading the screen, so with W3C signs a portrait phone between flat and upright reads `y + z > 0`.
 * A mean with `y + z < −2` is inverted. With `|y + z| <= 2` (the phone is on its side) the previous
 * decision from this page session is kept, or W3C signs when there is none.
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
