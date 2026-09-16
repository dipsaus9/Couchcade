/**
 * What calibration hands to every detector (docs/architecture/motion.md, "Calibration and the
 * motion frame").
 */
import type { RotationRate, Vec3 } from "../sensors/types.ts";

/**
 * The motion frame as unit vectors in the device frame: `right` (X, the player's right), `forward`
 * (Y, towards the TV) and `up` (Z). Orthonormal and right-handed: `right = forward × up`.
 */
export interface MotionFrame {
  right: Vec3;
  forward: Vec3;
  up: Vec3;
}

/** The result of rest calibration. Everything a later sample needs to become sign- and phone-free. */
export interface Calibration {
  /** `up0`: which way is up at rest, a unit vector in the device frame with W3C signs. */
  up: Vec3;
  /** The motion frame at rest. `frame.up` is `up`. */
  frame: MotionFrame;
  /** Gyroscope bias in deg/s, subtracted from every later sample. Zero after a timeout. */
  bias: RotationRate;
  /** `true` when the browser reports both acceleration fields with the sign flipped. */
  inverted: boolean;
  /** `true` when `inverted` was measured this time, `false` when the pose was unclear and it was kept. */
  signMeasured: boolean;
  /** `true` when no still second came within the timeout and the latest average was used. */
  timedOut: boolean;
  /** Median sample interval in ms over the samples used, for diagnostics. */
  interval: number;
  /** Time of the sample that completed calibration, in the samples' time base. */
  t: number;
}
