/**
 * Synthetic traces for calibration tests. `synthetic.still` and `synthetic.swing` keep gravity
 * fixed, so these builders also move gravity, add linear acceleration and add sensor noise.
 * Everything is given with W3C signs; `rawSigns: "inverted"` flips both acceleration fields the way
 * some iPhones may deliver them.
 */
import { expect } from "vitest";
import type { MotionSample, Trace, TraceSampleRow, TraceVector } from "@couchcade/motion/sensors";
import { traceSamples } from "@couchcade/motion/sensors";

export const G = 9.81;

const round = (value: number) => Math.round(value * 1000) / 1000 + 0;
const roundVector = (v: TraceVector): TraceVector => [round(v[0]), round(v[1]), round(v[2])];

export interface TraceSpec {
  durationMs: number;
  intervalMs?: number;
  /** Gravity-including acceleration without linear acceleration, W3C signs. */
  gravity: (t: number) => TraceVector;
  /** Linear acceleration, W3C signs. Defaults to none. */
  acceleration?: (t: number) => TraceVector;
  /** deg/s `[alpha, beta, gamma]`, or `null` for a phone without a gyroscope. Defaults to none. */
  rotation?: ((t: number) => TraceVector) | null;
  rawSigns?: Trace["rawSigns"];
}

export function traceOf(spec: TraceSpec): Trace {
  const {
    durationMs,
    intervalMs = 1000 / 60,
    gravity,
    acceleration = () => [0, 0, 0],
    rotation = () => [0, 0, 0],
    rawSigns = "w3c",
  } = spec;
  const sign = rawSigns === "inverted" ? -1 : 1;
  const samples: TraceSampleRow[] = [];
  const count = Math.floor(durationMs / intervalMs + 1e-9) + 1;
  for (let i = 0; i < count; i++) {
    const t = i * intervalMs;
    const a = acceleration(t);
    const g = gravity(t);
    samples.push([
      round(t),
      round(intervalMs),
      roundVector([a[0] * sign, a[1] * sign, a[2] * sign]),
      roundVector([(g[0] + a[0]) * sign, (g[1] + a[1]) * sign, (g[2] + a[2]) * sign]),
      rotation ? roundVector(rotation(t)) : null,
    ]);
  }
  return {
    v: 1,
    gesture: "still",
    label: "calibration-test",
    platform: rawSigns === "inverted" ? "ios" : "android",
    device: "synthetic",
    recordedAt: "1970-01-01",
    rawSigns,
    expect: { events: 0 },
    marks: [],
    samples,
  };
}

export const samplesOf = (spec: TraceSpec): MotionSample[] => traceSamples(traceOf(spec));

/** Gravity of a portrait phone tilted `degrees` from flat face up (0) towards upright (90). */
export function portrait(degrees: number): TraceVector {
  const angle = (degrees * Math.PI) / 180;
  return [0, G * Math.sin(angle), G * Math.cos(angle)];
}

/** Deterministic noise in `[-amplitude, amplitude]` from a seeded linear congruential generator. */
export function noise(seed: number): (amplitude: number) => number {
  let state = seed >>> 0;
  return (amplitude) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 2 ** 32) * 2 * amplitude - amplitude;
  };
}

/** Angle between two vectors in degrees. */
export function angleBetween(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const size = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  return (Math.acos(Math.min(Math.max(dot / size, -1), 1)) * 180) / Math.PI;
}

type VectorLike = { x: number; y: number; z: number };

declare module "vitest" {
  // oxlint-disable-next-line typescript/no-explicit-any -- must match vitest's own declaration
  interface Matchers<T = any> {
    /** `toBeCloseTo` on each of `x`, `y` and `z`, so `+0` and `-0` count as equal. */
    toBeNearVector(expected: Readonly<TraceVector> | VectorLike, digits?: number): T;
  }
}

expect.extend({
  toBeNearVector(
    received: VectorLike | null | undefined,
    expected: Readonly<TraceVector> | VectorLike,
    digits = 3,
  ) {
    const [x, y, z] = "x" in expected ? [expected.x, expected.y, expected.z] : expected;
    const tolerance = 10 ** -digits / 2;
    const pass =
      received != null &&
      Math.abs(received.x - x) < tolerance &&
      Math.abs(received.y - y) < tolerance &&
      Math.abs(received.z - z) < tolerance;
    return {
      pass,
      message: () =>
        `expected ${this.utils.printReceived(received)} ${pass ? "not " : ""}to be within ${tolerance} of ${this.utils.printExpected({ x, y, z })}`,
    };
  },
});
