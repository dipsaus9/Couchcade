/**
 * Trace format version 1 (docs/architecture/motion.md, "Trace format"): recorded or synthetic
 * sensor data as JSON. CC-5.9 records real ones and documents the format for contributors.
 */
import type { MotionSample } from "./types.ts";

/** `[x, y, z]` in m/s², or `[alpha, beta, gamma]` in deg/s. */
export type TraceVector = [number, number, number];

/** `[t, interval, acceleration, gravityAcceleration, rotationRate]`, `t` in ms from the start. */
export type TraceSampleRow = [
  t: number,
  interval: number,
  acceleration: TraceVector | null,
  gravityAcceleration: TraceVector | null,
  rotationRate: TraceVector | null,
];

export type TraceMarkType = "grip-down" | "grip-up" | "recentre";

/** `[t, type]`, `t` in ms from the first sample. */
export type TraceMark = [t: number, type: TraceMarkType];

export type TraceGesture = "swing" | "aim" | "flick" | "tilt" | "shake" | "still";

export interface Trace {
  v: 1;
  gesture: TraceGesture;
  /** Kebab-case, unique per gesture and platform. */
  label: string;
  platform: "ios" | "android";
  /** Free text. */
  device: string;
  /** `YYYY-MM-DD`. */
  recordedAt: string;
  /** How the browser reported gravity. */
  rawSigns: "w3c" | "inverted";
  /** What a detector with default config should produce. */
  expect: { events: number; fields?: Record<string, [min: number, max: number]> };
  marks: TraceMark[];
  samples: TraceSampleRow[];
}

/** The only trace version readers accept. */
export const TRACE_VERSION = 1;

const vec = (row: TraceVector | null) => (row ? { x: row[0], y: row[1], z: row[2] } : null);

/**
 * The trace's samples as `MotionSample`s, with `t` as in the trace. Throws on any version other
 * than 1.
 */
export function traceSamples(trace: Pick<Trace, "v" | "samples">): MotionSample[] {
  if (trace.v !== TRACE_VERSION) {
    throw new Error(`Unsupported motion trace version ${String(trace.v)}, expected 1.`);
  }
  return trace.samples.map(([t, interval, acceleration, gravityAcceleration, rotationRate]) => ({
    t,
    interval,
    acceleration: vec(acceleration),
    gravityAcceleration: vec(gravityAcceleration),
    rotationRate: rotationRate
      ? { alpha: rotationRate[0], beta: rotationRate[1], gamma: rotationRate[2] }
      : null,
  }));
}
