/**
 * Synthetic tilt traces: a phone held flat like a tray, rolled left/right and pitched
 * forward/back. Gravity and the rotation rate follow the physics, so the pose tracker sees what a
 * real phone would deliver. Mirrors test/aim/traces.ts's technique.
 */
import { calibrateRest, createPoseTracker } from "@couchcade/motion/calibration";
import type { Calibration, PoseReading } from "@couchcade/motion/calibration";
import type { MotionSample, Trace, TraceVector } from "@couchcade/motion/sensors";
import { G, samplesOf } from "../calibration/traces.ts";

type Matrix = readonly [TraceVector, TraceVector, TraceVector];

const RAD = Math.PI / 180;

const rotX = (a: number): Matrix => {
  const [c, s] = [Math.cos(a * RAD), Math.sin(a * RAD)];
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
};

const rotY = (a: number): Matrix => {
  const [c, s] = [Math.cos(a * RAD), Math.sin(a * RAD)];
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
};

const dot = (a: TraceVector, b: TraceVector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const mul = (a: Matrix, b: Matrix): Matrix => {
  const [c0, c1, c2] = transpose(b);
  const row = (r: TraceVector): TraceVector => [dot(r, c0), dot(r, c1), dot(r, c2)];
  return [row(a[0]), row(a[1]), row(a[2])];
};

const apply = (m: Matrix, v: TraceVector): TraceVector => [
  dot(m[0], v),
  dot(m[1], v),
  dot(m[2], v),
];

const transpose = (m: Matrix): Matrix => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];

/** An angle curve in degrees over time in ms. */
export type Curve = (t: number) => number;

export interface TiltTraceSpec {
  durationMs: number;
  /** Roll around the forward axis, degrees, positive when the right edge dips. Defaults to 0. */
  roll?: Curve;
  /** Pitch around the right axis, degrees, positive when the top edge dips away. Defaults to 0. */
  pitch?: Curve;
  /** Linear (non-gravity) acceleration, W3C signs, for the shake/bump hold. Defaults to none. */
  acceleration?: (t: number) => TraceVector;
  /** An extra rotation rate the calibration never saw, deg/s `[alpha, beta, gamma]`. */
  drift?: (t: number) => TraceVector;
  rawSigns?: Trace["rawSigns"];
}

/**
 * The phone's device-to-world rotation: roll around the forward axis, then pitch (negated: a
 * positive pitch curve value dips the top edge away, opposite of a plain rotation around right).
 * World axes are the motion frame: x right, y towards the TV, z up. At rest this is the identity.
 */
const pose = (roll: number, pitch: number): Matrix => mul(rotX(-pitch), rotY(roll));

export function tiltSamples(spec: TiltTraceSpec): MotionSample[] {
  const {
    durationMs,
    roll = () => 0,
    pitch = () => 0,
    acceleration,
    drift = () => [0, 0, 0],
    rawSigns = "w3c",
  } = spec;
  const h = 0.5;
  const rate = (curve: Curve, t: number) => (curve(t + h) - curve(t - h)) / ((2 * h) / 1000);
  const negatedPitch = (t: number) => -pitch(t);
  const deviceToWorld = (t: number) => pose(roll(t), pitch(t));

  return samplesOf({
    durationMs,
    rawSigns,
    acceleration,
    gravity: (t) => apply(transpose(deviceToWorld(t)), [0, 0, G]),
    rotation: (t) => {
      // Angular velocity in the world: pitch's own axis (outermost, untransformed) plus roll's own
      // axis transformed by the outer pitch rotation currently in effect.
      const outer = rotX(negatedPitch(t));
      const x: TraceVector = [1, 0, 0];
      const y = apply(outer, [0, 1, 0]);
      const [dPitch, dRoll] = [rate(negatedPitch, t), rate(roll, t)];
      const world: TraceVector = [
        dPitch * x[0] + dRoll * y[0],
        dPitch * x[1] + dRoll * y[1],
        dPitch * x[2] + dRoll * y[2],
      ];
      const device = apply(transpose(deviceToWorld(t)), world);
      const [ax, ay, az] = drift(t);
      return [device[0] + ax, device[1] + ay, device[2] + az];
    },
  });
}

/** A smooth move from `from` to `to` degrees between `startMs` and `endMs`. */
export function ease(from: number, to: number, startMs: number, endMs: number): Curve {
  return (t) => {
    const f = Math.min(Math.max((t - startMs) / (endMs - startMs), 0), 1);
    return from + (to - from) * f * f * (3 - 2 * f);
  };
}

/** The phone holds still for the first 1,200 ms, so calibration completes before anything moves. */
export const CALIBRATION_MS = 1200;

export interface CalibratedTrace {
  calibration: Calibration;
  /** The samples after calibration completed. */
  samples: MotionSample[];
}

export function calibrated(samples: MotionSample[]): CalibratedTrace {
  const calibration = calibrateRest(samples);
  if (!calibration) throw new Error("calibration did not complete");
  return { calibration, samples: samples.filter((s) => s.t > calibration.t) };
}

/** Runs the samples through one pose tracker, as a controller does. */
export function poseReadings(samples: MotionSample[]): PoseReading[] {
  const trace = calibrated(samples);
  const tracker = createPoseTracker(trace.calibration);
  return trace.samples.map((sample) => tracker.push(sample));
}
