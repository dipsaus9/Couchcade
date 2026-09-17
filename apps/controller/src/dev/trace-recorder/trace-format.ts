/**
 * Version 1 trace assembly (docs/architecture/motion.md, "Trace format (version 1)"; documented in
 * full in packages/motion/test/traces/README.md). Pure: no DOM, no fetch, so it's easy to reason
 * about from RecorderApp.vue and the save endpoint in vite.config.ts alike.
 *
 * This hand-mirrors packages/motion/src/sensors/trace.ts's shape instead of importing it: the
 * CC-5.9 amendment (motion.md conflict 6) only lets this story add the `trace:record` script line
 * to apps/controller/package.json, and @couchcade/motion isn't a declared dependency of
 * @couchcade/controller. Keep the two in sync by hand if the format ever changes.
 */

export const TRACE_GESTURES = ["swing", "aim", "flick", "tilt", "shake", "still"] as const;
export type TraceGesture = (typeof TRACE_GESTURES)[number];

export const TRACE_PLATFORMS = ["ios", "android"] as const;
export type TracePlatform = (typeof TRACE_PLATFORMS)[number];

export type TraceMarkType = "grip-down" | "grip-up" | "recentre";

/** `[x, y, z]` in m/s², or `[alpha, beta, gamma]` in deg/s. */
export type TraceVector = [number, number, number];

/** `[t, interval, acceleration, gravityAcceleration, rotationRate]`, `t` in ms from the first sample. */
export type TraceSampleRow = [
  t: number,
  interval: number,
  acceleration: TraceVector | null,
  gravityAcceleration: TraceVector | null,
  rotationRate: TraceVector | null,
];

/** `[t, type]`, `t` in ms from the first sample. */
export type TraceMark = [t: number, type: TraceMarkType];

export interface RecordedTrace {
  v: 1;
  gesture: TraceGesture;
  label: string;
  platform: TracePlatform;
  device: string;
  recordedAt: string;
  rawSigns: "w3c" | "inverted";
  expect: { events: number };
  marks: TraceMark[];
  samples: TraceSampleRow[];
}

const LABEL_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Kebab-case, the format's own rule: "unique per gesture and platform". */
export function isKebabCase(label: string): boolean {
  return LABEL_PATTERN.test(label);
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** Rounds a raw device-frame vector to 3 decimals, the format's own precision (motion.md). */
export function roundVector(v: readonly [number, number, number]): TraceVector {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}

/**
 * The gravity sign rule from motion.md, "Sign conventions" rule 2: reading the screen, a portrait
 * phone held between flat and upright has W3C-sign gravity with `y + z > 0`. Below `-band` the
 * browser reports it inverted; within the band the pose is unclear and the previous decision from
 * this recording session (or W3C signs, with no previous one) is kept.
 */
export function detectRawSigns(
  meanY: number,
  meanZ: number,
  previous: "w3c" | "inverted" = "w3c",
  band = 2,
): "w3c" | "inverted" {
  const facing = meanY + meanZ;
  if (facing < -band) return "inverted";
  if (facing > band) return "w3c";
  return previous;
}

/** `YYYY-MM-DD`, the format's `recordedAt` shape. */
export function todayDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A minimal `expect`: only whether an event should fire at all. Field ranges are added by hand
 * after reviewing the trace (motion.md: "checked by hand once").
 */
export function defaultExpect(gesture: TraceGesture): { events: number } {
  return { events: gesture === "still" ? 0 : 1 };
}
