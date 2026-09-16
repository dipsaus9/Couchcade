/**
 * The pose tracker (motion.md, "Pose tracker"): how the phone is turned right now, not only at rest.
 * Swing, aim, flick and tilt read it. One tracker runs per controller, on phones with a gyroscope.
 * Accelerometer-only phones have no tracker.
 */
import type { MotionSample, Vec3 } from "../sensors/types.ts";
import { correctSample, frameSample, type MotionFrameSample } from "./frame.ts";
import type { Calibration } from "./types.ts";
import {
  conjugate,
  cross,
  dot,
  fromRotationVector,
  fromRows,
  length,
  multiply,
  normalise,
  normaliseQuaternion,
  type Quaternion,
  rateVector,
  rotate,
  scale,
  vec,
} from "./vector.ts";

/** Standard gravity in m/s². */
export const STANDARD_GRAVITY = 9.81;

export interface PoseTrackerOptions {
  /** Longest time step integrated from one sample, in ms, so a stalled event doesn't jump. Defaults to 50. */
  maxStepMs?: number;
  /** Share of the gravity error corrected per sample. Defaults to 0.02. `0` turns correction off. */
  gravityGain?: number;
  /** Correct only while the gravity-including magnitude is within this of 9.81 m/s². Defaults to 1.5. */
  gravityTolerance?: number;
}

/** A sample in the motion frame of the phone's current pose, plus that pose. */
export interface PoseReading extends MotionFrameSample {
  /** Turns device-frame vectors into the motion frame: `rotate(orientation, v)`. */
  orientation: Quaternion;
}

export interface PoseTracker {
  /** Feeds one sample as the adapter delivered it. Signs and bias are fixed with the calibration. */
  push(sample: MotionSample): PoseReading;
  /** The current pose: turns device-frame vectors into the motion frame. */
  orientation(): Quaternion;
  /** A device-frame vector in the motion frame of the current pose. */
  toMotion(v: Vec3): Vec3;
  /** Which way is up right now, as a unit vector in the device frame. */
  up(): Vec3;
  /** Back to the rest pose captured at calibration. */
  reset(): void;
}

const DEG = Math.PI / 180;

const MOTION_UP = vec(0, 0, 1);

/**
 * Tracks the pose from the calibration's rest pose:
 *
 * 1. Integrates the bias-corrected rotation rate into the orientation, using each sample's `t`
 *    difference capped at 50 ms.
 * 2. Pulls pitch and roll towards the measured gravity direction by 2% per sample, only while the
 *    gravity-including magnitude is within 1.5 m/s² of 9.81. During a swing the gyroscope carries
 *    the pose.
 * 3. Yaw can't be corrected without a compass and drifts slowly. Aim fixes that with recentring.
 */
export function createPoseTracker(
  calibration: Calibration,
  options: PoseTrackerOptions = {},
): PoseTracker {
  const { maxStepMs = 50, gravityGain = 0.02, gravityTolerance = 1.5 } = options;
  const { right, forward, up } = calibration.frame;
  const rest = fromRows(right, forward, up);

  let pose = rest;
  let lastT: number | null = null;

  const deviceUp = () => rotate(conjugate(pose), MOTION_UP);

  return {
    push(sample) {
      const corrected = correctSample(sample, calibration);
      const step = lastT === null ? 0 : Math.min(Math.max(corrected.t - lastT, 0), maxStepMs);
      lastT = corrected.t;

      if (corrected.rotationRate && step > 0) {
        // The rate is in the device frame, so the step turns the pose on its device side.
        const turn = scale(rateVector(corrected.rotationRate), DEG * (step / 1000));
        pose = normaliseQuaternion(multiply(pose, fromRotationVector(turn)));
      }

      const gravity = corrected.gravityAcceleration;
      if (gravity && gravityGain > 0) {
        const measured = normalise(gravity);
        if (measured && Math.abs(length(gravity) - STANDARD_GRAVITY) <= gravityTolerance) {
          // Turn the predicted up a share of the way towards the measured up. Turning a device-frame
          // vector by +angle means turning the pose by −angle on its device side.
          const predicted = deviceUp();
          const axis = normalise(cross(predicted, measured));
          if (axis) {
            const angle = Math.acos(Math.min(Math.max(dot(predicted, measured), -1), 1));
            const correction = fromRotationVector(scale(axis, -gravityGain * angle));
            pose = normaliseQuaternion(multiply(pose, correction));
          }
        }
      }

      const orientation = pose;
      return { ...frameSample(corrected, (v) => rotate(orientation, v)), orientation };
    },

    orientation: () => pose,

    toMotion: (v) => rotate(pose, v),

    up: deviceUp,

    reset() {
      pose = rest;
      lastT = null;
    },
  };
}
