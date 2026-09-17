/**
 * Synthetic flick traces from a simple dart-throw model: the phone points its top edge at the TV,
 * the player grips, cocks the phone back slowly, then snaps it forward and down around a pivot
 * behind it (the elbow and wrist together). The body can turn first, the hand can pull sideways
 * during the snap and the wrist can twist around the phone's long axis. Rotation rate, gravity and
 * linear acceleration all follow from that motion, so the pose tracker and the detector see what a
 * real phone would deliver. Traces are version 1 with grip marks and `expect` ranges.
 */
import { calibrateRest, createPoseTracker } from "@couchcade/motion/calibration";
import type { Flick, FlickDetector, FlickMark } from "@couchcade/motion/gestures";
import { type Trace, type TraceVector, traceSamples } from "@couchcade/motion/sensors";
import { traceOf } from "../calibration/traces.ts";

type Matrix = readonly [TraceVector, TraceVector, TraceVector];

const RAD = Math.PI / 180;
const G = 9.81;

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

const transpose = (m: Matrix): Matrix => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];

const mul = (...ms: Matrix[]): Matrix =>
  ms.reduce((a, b) => {
    const [c0, c1, c2] = transpose(b);
    const row = (r: TraceVector): TraceVector => [dot(r, c0), dot(r, c1), dot(r, c2)];
    return [row(a[0]), row(a[1]), row(a[2])];
  });

const apply = (m: Matrix, v: TraceVector): TraceVector => [
  dot(m[0], v),
  dot(m[1], v),
  dot(m[2], v),
];

/** Sample spacing at 60 Hz. */
export const INTERVAL_MS = 1000 / 60;
/** The body turns between these times when `turn` is set, after calibration's still second. */
const TURN_START = 1300;
const TURN_END = 1600;
/** The thumb presses the grip here. */
export const GRIP_DOWN_MS = 1700;
/** The snap peaks on this sample (index 180 at 60 Hz), so the peak sample is exact. */
export const PEAK_MS = 180 * INTERVAL_MS;
/** The snap sweeps the top edge down through this arc. */
const SNAP_ARC_DEG = 60;
/** The sideways pull happens over this long up to the peak, the window the direction is read over. */
const PULL_MS = 150;

export interface FlickTraceSpec {
  /** Peak pitch-down rate of the snap, deg/s. `0` holds the phone still. */
  peak: number;
  /** How far the hand turns right during the 150 ms up to the peak, degrees. */
  pull?: number;
  /** Peak wrist twist rate around the phone's long axis during the snap, deg/s. */
  twist?: number;
  /** How far the body (and phone) turns right before grip-down, degrees. */
  turn?: number;
  /** How far the phone is slowly cocked back (top edge up) before the snap, degrees. */
  cock?: number;
  /** Pivot to phone, metres. `0` turns the phone in place, with no linear acceleration. */
  radiusM?: number;
  /** When the thumb lets go of the grip, ms. Defaults to 400 ms after the peak. */
  gripUpMs?: number;
  /** `false` leaves the grip marks out. */
  grip?: boolean;
  rawSigns?: Trace["rawSigns"];
  expect?: Trace["expect"];
}

const smooth = (from: number, to: number, start: number, end: number) => (t: number) => {
  const f = Math.min(Math.max((t - start) / (end - start), 0), 1);
  return from + (to - from) * f * f * (3 - 2 * f);
};

/** A flick trace in the version 1 format, with grip marks. */
export function flickTrace(spec: FlickTraceSpec): Trace {
  const {
    peak,
    pull = 0,
    twist = 0,
    turn = 0,
    cock = 20,
    radiusM = 0.35,
    grip = true,
    rawSigns = "w3c",
  } = spec;
  const gripUpMs = spec.gripUpMs ?? PEAK_MS + 400;
  // The snap is a half-sine pitch rate pulse, so its peak rate is `peak` exactly at `PEAK_MS`.
  const durationMs = (Math.PI * SNAP_ARC_DEG * 1000) / (2 * Math.max(peak, 1));
  const startMs = PEAK_MS - durationMs / 2;
  const snapped = (rate: number) => (t: number) => {
    if (peak <= 0 || rate === 0) return 0;
    const phase = Math.min(Math.max((t - startMs) / durationMs, 0), 1);
    return ((rate * durationMs) / (Math.PI * 1000)) * (1 - Math.cos(Math.PI * phase));
  };
  const cocked = peak > 0 ? smooth(0, cock, GRIP_DOWN_MS + 50, startMs - 150) : () => 0;
  const pitch = (t: number) => cocked(t) - snapped(peak)(t);
  const roll = snapped(twist);
  const bodyTurn = smooth(0, turn, TURN_START, TURN_END);
  const pulled = smooth(0, pull, PEAK_MS - PULL_MS, PEAK_MS);
  const heading = (t: number) => bodyTurn(t) + pulled(t);

  // Device to world: heading, then the snap around the heading's right axis, then the resting grip
  // (top edge towards the TV, tipped up 10°), then the wrist twist around the long axis.
  const pose = (t: number) => mul(rotZ(-heading(t)), rotX(pitch(t)), rotX(10), rotY(roll(t)));
  // The phone sits `radiusM` ahead of the pivot along its top edge.
  const position = (t: number): TraceVector => apply(pose(t), [0, radiusM, 0]);

  const h = 0.25;
  const acceleration = (t: number): TraceVector => {
    const [p0, p1, p2] = [position(t - h), position(t), position(t + h)];
    const s = (1000 / h) ** 2;
    const world: TraceVector = [
      (p2[0] - 2 * p1[0] + p0[0]) * s,
      (p2[1] - 2 * p1[1] + p0[1]) * s,
      (p2[2] - 2 * p1[2] + p0[2]) * s,
    ];
    return apply(transpose(pose(t)), world);
  };
  const rotation = (t: number): TraceVector => {
    // Ṙ Rᵀ is the skew matrix of the world angular velocity.
    const [a, b, r] = [pose(t - h), pose(t + h), pose(t)];
    const k = 1000 / (2 * h);
    const diff = (i: 0 | 1 | 2): TraceVector => [
      (b[i][0] - a[i][0]) * k,
      (b[i][1] - a[i][1]) * k,
      (b[i][2] - a[i][2]) * k,
    ];
    const w = mul([diff(0), diff(1), diff(2)], transpose(r));
    const world: TraceVector = [
      (w[2][1] - w[1][2]) / 2 / RAD,
      (w[0][2] - w[2][0]) / 2 / RAD,
      (w[1][0] - w[0][1]) / 2 / RAD,
    ];
    return apply(transpose(r), world);
  };

  const trace = traceOf({
    durationMs: Math.max(gripUpMs, PEAK_MS) + 300,
    rawSigns,
    gravity: (t) => apply(transpose(pose(t)), [0, 0, G]),
    acceleration,
    rotation,
  });
  return {
    ...trace,
    gesture: peak > 0 ? "flick" : "still",
    label: "synthetic-dart-flick",
    expect: spec.expect ?? { events: peak > 0 ? 1 : 0 },
    marks: grip
      ? [
          [GRIP_DOWN_MS, "grip-down"],
          [gripUpMs, "grip-up"],
        ]
      : [],
  };
}

export interface Emitted {
  flick: Flick;
  t: number;
}

/**
 * Replays a trace the way a controller runs: calibration on the first still second, one pose
 * tracker, and the grip marks applied before any later sample.
 */
export function replay(trace: Trace, detector: FlickDetector): Emitted[] {
  const samples = traceSamples(trace);
  const calibration = calibrateRest(samples);
  if (!calibration) throw new Error("calibration did not complete");
  const tracker = createPoseTracker(calibration);
  const emitted: Emitted[] = [];
  const off = detector.on((flick, t) => emitted.push({ flick, t }));
  const marks: FlickMark[] = trace.marks.map(([t, type]) => ({ t, type }));
  for (const sample of samples.filter((s) => s.t > calibration.t)) {
    while (marks[0] && marks[0].t < sample.t) detector.mark(marks.shift() as FlickMark);
    detector.push(tracker.push(sample));
  }
  for (const mark of marks) detector.mark(mark);
  off();
  return emitted;
}
