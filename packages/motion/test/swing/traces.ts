/**
 * Synthetic swing traces from a simple arm model: the hand swings like a pendulum from the
 * shoulder, the phone turns with the hand and the wrist can twist around the phone's long axis.
 * Rotation rate, gravity and linear acceleration all follow from that motion, so the pose tracker
 * and the detector see what a real phone would deliver. Traces are version 1 with grip marks.
 */
import { calibrateRest, createPoseTracker } from "@couchcade/motion/calibration";
import type { PoseReading } from "@couchcade/motion/calibration";
import { type Swing, type SwingDetector, type SwingMark } from "@couchcade/motion/gestures";
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
/** The phone holds still this long first, so calibration completes before anything moves. */
export const CALIBRATION_MS = 1200;
/** The body turns between these times when `turn` is set. */
const TURN_START = 1300;
const TURN_END = 1600;
/** The thumb presses the grip here. */
export const GRIP_DOWN_MS = 1700;
/** The forward swing peaks on this sample (index 180 at 60 Hz), so the peak sample is exact. */
export const PEAK_MS = 180 * INTERVAL_MS;
/** How long the arm rests at the top of the backswing before swinging forward. */
const BACKSWING_PAUSE_MS = 150;
/**
 * The forward swing sweeps this arc by default, half before the bottom and half after. This was
 * tuned as a small, fast, forearm/wrist-only motion (closer to a flick than a bowler's full arm) -
 * see `armArcDeg` below for a wider, more realistic full-arm sweep.
 */
const ARC_DEG = 120;

export interface SwingTraceSpec {
  /** Peak arm rate of the forward swing, deg/s. `0` holds the arm still. */
  peak: number;
  /** Swing direction from where the body faces at grip-down, degrees, positive to the right. */
  angle?: number;
  /** Peak wrist twist rate around the phone's long axis during the swing, deg/s. Positive is clockwise as the player sees it. */
  twist?: number;
  /** How far the body (and phone) turns right before grip-down, degrees. */
  turn?: number;
  /** Shoulder to phone, metres. */
  armM?: number;
  /**
   * The forward swing's total arc, degrees, half before the bottom and half after. Defaults to
   * `ARC_DEG` (120°), a small, fast forearm/wrist motion. A real full-arm bowling swing - from
   * behind the body, through the bottom, to a forward follow-through - sweeps far more: CC-12.8
   * uses 150-165° for its realistic fixtures (`realistic.test.ts`), reasoned from a shoulder-driven
   * swing rather than a wrist flick.
   */
  armArcDeg?: number;
  /** When the thumb lets go of the grip, ms. Defaults to 500 ms after the peak. */
  gripUpMs?: number;
  /** Extra rotation rate on every sample while gripped, deg/s, like sensor noise or a shaky hand. */
  jitter?: (t: number) => TraceVector;
  rawSigns?: Trace["rawSigns"];
}

const smooth = (from: number, to: number, start: number, end: number) => (t: number) => {
  const f = Math.min(Math.max((t - start) / (end - start), 0), 1);
  return from + (to - from) * f * f * (3 - 2 * f);
};

/**
 * The forward swing is a half-sine rate pulse around the bottom of the arc, so its peak rate is
 * `peak` exactly at `PEAK_MS`. Before it the arm eases back to the top of the backswing and waits.
 */
function armAngle(spec: SwingTraceSpec): {
  theta: (t: number) => number;
  aim: (t: number) => number;
  startMs: number;
} {
  const { peak, armArcDeg = ARC_DEG } = spec;
  if (peak <= 0) return { theta: () => 0, aim: () => 0, startMs: PEAK_MS };
  const durationMs = (Math.PI * armArcDeg * 1000) / (2 * peak);
  const startMs = PEAK_MS - durationMs / 2;
  // The backswing starts just after grip-down and is slow: under the start rate for firm swings.
  const back = smooth(0, -armArcDeg / 2, GRIP_DOWN_MS + 50, startMs - BACKSWING_PAUSE_MS);
  // Meanwhile the hand turns towards the swing direction, so the phone stays in the swing plane.
  const aim = smooth(0, spec.angle ?? 0, GRIP_DOWN_MS + 50, startMs - BACKSWING_PAUSE_MS);
  const theta = (t: number) => {
    const phase = (t - startMs) / durationMs;
    if (phase <= 0) return back(t);
    const swept =
      ((peak * durationMs) / (Math.PI * 1000)) * (1 - Math.cos(Math.PI * Math.min(phase, 1)));
    return -armArcDeg / 2 + swept;
  };
  return { theta, aim, startMs };
}

/** A swing trace in the version 1 format, with grip marks. */
export function swingTrace(spec: SwingTraceSpec): Trace {
  const { twist = 0, turn = 0, armM = 0.6, armArcDeg = ARC_DEG, rawSigns = "w3c", jitter } = spec;
  const gripUpMs = spec.gripUpMs ?? PEAK_MS + 500;
  const { theta, aim, startMs } = armAngle(spec);
  const durationMs = (Math.PI * armArcDeg * 1000) / (2 * Math.max(spec.peak, 1));
  const heading = smooth(0, turn, TURN_START, TURN_END);
  // The wrist twists with the same half-sine pulse as the arm.
  const roll = (t: number) => {
    if (twist === 0 || spec.peak <= 0) return 0;
    const phase = Math.min(Math.max((t - startMs) / durationMs, 0), 1);
    return ((twist * durationMs) / (Math.PI * 1000)) * (1 - Math.cos(Math.PI * phase));
  };

  // Device to world: body heading plus the hand turning into the swing direction, then the arm
  // around the swing plane's axis, then the resting grip (top edge towards the TV, tipped up 10°),
  // then the wrist twist around the long axis.
  const plane = (t: number) => rotZ(-(heading(t) + aim(t)));
  const pose = (t: number) => mul(plane(t), rotX(theta(t)), rotX(10), rotY(roll(t)));
  const position = (t: number): TraceVector => {
    const a = theta(t) * RAD;
    return apply(plane(t), [0, armM * Math.sin(a), -armM * Math.cos(a)]);
  };

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
    const device = apply(transpose(r), world);
    const extra: TraceVector = jitter && t >= GRIP_DOWN_MS && t <= gripUpMs ? jitter(t) : [0, 0, 0];
    return [device[0] + extra[0], device[1] + extra[1], device[2] + extra[2]];
  };

  const trace = traceOf({
    durationMs: gripUpMs + 300,
    rawSigns,
    gravity: (t) => apply(transpose(pose(t)), [0, 0, G]),
    acceleration,
    rotation,
  });
  return {
    ...trace,
    gesture: spec.peak > 0 ? "swing" : "still",
    label: "synthetic-arm-swing",
    marks: [
      [GRIP_DOWN_MS, "grip-down"],
      [gripUpMs, "grip-up"],
    ],
  };
}

export interface Emitted {
  swing: Swing;
  t: number;
}

/**
 * Replays a trace the way a controller runs: calibration on the first still second, one pose
 * tracker, and the grip marks applied before any later sample.
 */
export function replay(trace: Trace, detector: SwingDetector): Emitted[] {
  const samples = traceSamples(trace);
  const calibration = calibrateRest(samples);
  if (!calibration) throw new Error("calibration did not complete");
  const tracker = createPoseTracker(calibration);
  const emitted: Emitted[] = [];
  const off = detector.on((swing, t) => emitted.push({ swing, t }));
  const marks: SwingMark[] = trace.marks.map(([t, type]) => ({ t, type }));
  for (const sample of samples.filter((s) => s.t > calibration.t)) {
    while (marks[0] && marks[0].t < sample.t) detector.mark(marks.shift() as SwingMark);
    const reading: PoseReading = tracker.push(sample);
    detector.push(reading);
  }
  for (const mark of marks) detector.mark(mark);
  off();
  return emitted;
}
