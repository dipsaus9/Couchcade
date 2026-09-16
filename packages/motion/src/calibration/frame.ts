/**
 * The motion frame (motion.md, "The motion frame"): X to the player's right, Y forward towards the
 * TV, Z up. Every gesture is computed in it, so phone model, grip and platform signs stop mattering.
 */
import type { MotionSample, RotationRate, Vec3 } from "../sensors/types.ts";
import { applySigns } from "./signs.ts";
import type { Calibration, MotionFrame } from "./types.ts";
import { cross, dot, normalise, perpendicular, rateVector, vec } from "./vector.ts";

/** Forward falls back to the side rule when the horizontal part of `y − z` is shorter than this. */
export const FORWARD_MIN_HORIZONTAL = 0.2;

/** The unit device vector `y − z`: the top edge and the back of a portrait phone, both away from the player. */
const AWAY = vec(0, Math.SQRT1_2, -Math.SQRT1_2);

const X_AXIS = vec(1, 0, 0);

/**
 * The motion frame for a phone whose up is the unit device vector `up`:
 *
 * - Z is `up`.
 * - Y is the horizontal part of the unit device vector `y − z`, normalised. A portrait phone held
 *   anywhere between flat and upright has its top edge or its back facing the TV.
 * - When that horizontal part is shorter than 0.2 (the phone is held on its side), Y is the
 *   horizontal part of `+x` turned a quarter turn around up, the way that keeps `+x` on the
 *   player's right.
 * - X is `Y × Z`.
 */
export function motionFrame(up: Vec3): MotionFrame {
  const away = perpendicular(AWAY, up);
  const forward =
    dot(away, away) >= FORWARD_MIN_HORIZONTAL ** 2
      ? normalise(away)
      : normalise(cross(up, perpendicular(X_AXIS, up)));
  // `up` is a unit vector, so one of the two horizontal parts is always long enough.
  const y = forward ?? vec(0, 1, 0);
  return { right: cross(y, up), forward: y, up };
}

/** A device-frame vector in motion-frame coordinates: `x` right, `y` forward, `z` up. */
export const toFrame = (v: Vec3, frame: MotionFrame): Vec3 =>
  vec(dot(v, frame.right), dot(v, frame.forward), dot(v, frame.up));

/**
 * The sample in the device frame with W3C signs and the gyroscope bias removed. Detectors that keep
 * their own pose (the pose tracker) start from this.
 */
export function correctSample(sample: MotionSample, calibration: Calibration): MotionSample {
  const signed = applySigns(sample, calibration.inverted);
  const { bias } = calibration;
  const rate = signed.rotationRate;
  return {
    ...signed,
    rotationRate: rate
      ? {
          alpha: rate.alpha - bias.alpha,
          beta: rate.beta - bias.beta,
          gamma: rate.gamma - bias.gamma,
        }
      : null,
  };
}

/** A sample in the motion frame. Vectors are `x` right, `y` forward, `z` up. */
export interface MotionFrameSample {
  t: number;
  interval: number;
  /** Linear acceleration in m/s². */
  acceleration: Vec3 | null;
  /** Acceleration including gravity in m/s². At rest about `{ x: 0, y: 0, z: 9.81 }`. */
  gravityAcceleration: Vec3 | null;
  /** Rotation rate in deg/s around right (`x`), forward (`y`) and up (`z`), right-handed. */
  rotationRate: Vec3 | null;
}

/**
 * The sample normalised to the motion frame captured at rest: signs fixed, bias removed, axes
 * turned into right, forward and up. Exact while the phone stays in its rest pose. Once it turns,
 * use the pose tracker, which follows the phone.
 */
export function normaliseSample(sample: MotionSample, calibration: Calibration): MotionFrameSample {
  return frameSample(correctSample(sample, calibration), (v) => toFrame(v, calibration.frame));
}

/** Turns every vector of a corrected sample with `turn`. */
export function frameSample(corrected: MotionSample, turn: (v: Vec3) => Vec3): MotionFrameSample {
  const { t, interval, acceleration, gravityAcceleration, rotationRate } = corrected;
  return {
    t,
    interval,
    acceleration: acceleration ? turn(acceleration) : null,
    gravityAcceleration: gravityAcceleration ? turn(gravityAcceleration) : null,
    rotationRate: rotationRate ? turn(rateVector(rotationRate)) : null,
  };
}

/** A rotation rate with every axis zero. */
export const ZERO_RATE: RotationRate = { alpha: 0, beta: 0, gamma: 0 };
