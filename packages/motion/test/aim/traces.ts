/**
 * Synthetic aim traces: a phone held like a remote, turned by heading, elevation and wrist roll
 * curves. Gravity and the rotation rate follow the physics, so the pose tracker sees what a real
 * phone would deliver.
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

const rotZ = (a: number): Matrix => {
  const [c, s] = [Math.cos(a * RAD), Math.sin(a * RAD)];
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
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

export interface AimTraceSpec {
  durationMs: number;
  /** Heading of the top edge in degrees, positive to the player's right. Defaults to 0. */
  heading?: Curve;
  /** Elevation of the top edge in degrees, positive up. Defaults to 10 (tipped up a little). */
  elevation?: Curve;
  /** Wrist roll around the phone's long axis in degrees. Defaults to 0. */
  roll?: Curve;
  /** An extra rotation rate the calibration never saw, deg/s `[alpha, beta, gamma]`. */
  drift?: (t: number) => TraceVector;
  rawSigns?: Trace["rawSigns"];
}

/**
 * The phone's device-to-world rotation: turn right by `heading`, tip the top edge up by
 * `elevation`, roll the wrist by `roll`. World axes are the motion frame: x right, y towards the
 * TV, z up. With no heading and roll, the calibrated motion frame is exactly this world frame.
 */
const pose = (heading: number, elevation: number, roll: number): Matrix =>
  mul(mul(rotZ(-heading), rotX(elevation)), rotY(roll));

export function aimSamples(spec: AimTraceSpec): MotionSample[] {
  const {
    durationMs,
    heading = () => 0,
    elevation = () => 10,
    roll = () => 0,
    drift = () => [0, 0, 0],
    rawSigns = "w3c",
  } = spec;
  const h = 0.5;
  const rate = (curve: Curve, t: number) => (curve(t + h) - curve(t - h)) / ((2 * h) / 1000);
  const deviceToWorld = (t: number) => pose(heading(t), elevation(t), roll(t));

  return samplesOf({
    durationMs,
    rawSigns,
    gravity: (t) => apply(transpose(deviceToWorld(t)), [0, 0, G]),
    rotation: (t) => {
      // Angular velocity in the world, from each angle's rate around its own axis.
      const turn = rotZ(-heading(t));
      const tip = mul(turn, rotX(elevation(t)));
      const x = apply(turn, [1, 0, 0]);
      const y = apply(tip, [0, 1, 0]);
      const [dh, de, dr] = [rate(heading, t), rate(elevation, t), rate(roll, t)];
      const world: TraceVector = [
        de * x[0] + dr * y[0],
        de * x[1] + dr * y[1],
        -dh + de * x[2] + dr * y[2],
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
