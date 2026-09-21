/**
 * Synthetic shake traces: a phone held still, then pushed and pulled along one device axis as two
 * opposite half-sine acceleration pulses -- a push-pull shake. Gravity stays constant and no
 * rotation rate is given (an accelerometer-only phone), so the pose stays fixed and the burst
 * direction is easy to reason about. Traces are version 1 with no marks -- shake needs no grip.
 */
import { calibrateRest, createPoseTracker } from "@couchcade/motion/calibration";
import type { Shake, ShakeDetector } from "@couchcade/motion/gestures";
import { type Trace, type TraceVector, traceSamples } from "@couchcade/motion/sensors";
import { G, traceOf } from "../calibration/traces.ts";

/** The phone holds still this long before the first pulse, so calibration completes. */
export const PADDING_MS = 1200;
/**
 * Each acceleration pulse lasts this long, ms. A multiple of `2 * (1000 / 60)`, so its peak (and
 * `PEAK_MS`, `GAP_MS` below) land exactly on a 60 Hz sample tick for exact-equality assertions.
 */
export const PULSE_MS = 100;
/** The default gap between the two pulses' peaks, ms. */
export const GAP_MS = 150;

export interface ShakeTraceSpec {
  /** Peak magnitude of each pulse, m/s². `0` holds the phone still. */
  peak: number;
  /** Gap between the two pulses' peaks, ms. Defaults to `GAP_MS`. */
  gapMs?: number;
  /** Which device axis the pulses point along, in opposite directions. Defaults to `"x"`. */
  axis?: "x" | "y" | "z";
  /** `false` makes the second pulse point the *same* way as the first -- a push, not a shake. */
  opposite?: boolean;
  rawSigns?: Trace["rawSigns"];
  expect?: Trace["expect"];
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/** The first pulse's peak time, ms from the start of the trace. */
export const firstPeakMs = (): number => PADDING_MS + PULSE_MS / 2;
/** The second pulse's peak time with the default gap, ms from the start of the trace. */
export const PEAK_MS = firstPeakMs() + GAP_MS;

/** A half-sine pulse reaching `amplitude` at `centerMs`, over `durationMs`. */
function pulse(centerMs: number, amplitude: number, durationMs: number) {
  return (t: number) => {
    const phase = (t - (centerMs - durationMs / 2)) / durationMs;
    return phase > 0 && phase < 1 ? amplitude * Math.sin(Math.PI * phase) : 0;
  };
}

/** A shake trace in the version 1 format: two acceleration pulses, no grip marks. */
export function shakeTrace(spec: ShakeTraceSpec): Trace {
  const { peak, gapMs = GAP_MS, axis = "x", opposite = true, rawSigns = "w3c" } = spec;
  const first = firstPeakMs();
  const second = first + gapMs;
  const totalMs = second + PULSE_MS / 2 + PADDING_MS;
  const index = AXIS_INDEX[axis];
  const firstPulse = pulse(first, peak, PULSE_MS);
  const secondPulse = pulse(second, opposite ? -peak : peak, PULSE_MS);
  const acceleration = (t: number): TraceVector => {
    const value = firstPulse(t) + secondPulse(t);
    const out: TraceVector = [0, 0, 0];
    out[index] = value;
    return out;
  };
  const trace = traceOf({
    durationMs: totalMs,
    rawSigns,
    gravity: () => [0, 0, G],
    acceleration,
    rotation: null,
  });
  return {
    ...trace,
    gesture: peak > 0 ? "shake" : "still",
    label: "synthetic-push-pull-shake",
    expect: spec.expect ?? { events: peak > 0 && opposite ? 1 : 0 },
    marks: [],
  };
}

export interface Emitted {
  shake: Shake;
  t: number;
}

/** Replays a trace the way a controller runs: calibration, then one pose tracker. No marks. */
export function replay(trace: Trace, detector: ShakeDetector): Emitted[] {
  const samples = traceSamples(trace);
  const calibration = calibrateRest(samples);
  if (!calibration) throw new Error("calibration did not complete");
  const tracker = createPoseTracker(calibration);
  const emitted: Emitted[] = [];
  const off = detector.on((shake, t) => emitted.push({ shake, t }));
  for (const sample of samples.filter((s) => s.t > calibration.t)) {
    detector.push(tracker.push(sample));
  }
  off();
  return emitted;
}
