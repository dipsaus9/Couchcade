/**
 * Synthetic trace builders (motion.md, "Testing with recorded traces", layer 1). They make traces
 * from simple curves in the version 1 format, so detector tests and E2E tests need no real phone.
 *
 * ```ts
 * import { synthetic } from "@couchcade/motion/sensors";
 * const trace = synthetic.swing({ peak: 600 }); // a half-sine rotation rate pulse
 * await fake.play(trace);
 * ```
 */
import type { Trace, TraceSampleRow, TraceVector } from "./trace.ts";

/** Standard gravity in m/s². */
const G = 9.81;

export interface SyntheticOptions {
  /** Sample spacing in ms. Defaults to 1000 / 60, the rate both platforms deliver. */
  intervalMs?: number;
  /** Gravity as a W3C-sign device vector. Defaults to a portrait phone tilted 45° towards the player. */
  gravity?: TraceVector;
  /** `inverted` negates both acceleration fields, as some iPhones may report them. */
  rawSigns?: Trace["rawSigns"];
  /** `false` drops the rotation rate, like a phone without a gyroscope. Defaults to `true`. */
  gyroscope?: boolean;
  platform?: Trace["platform"];
  label?: string;
}

export interface SyntheticSwingOptions extends SyntheticOptions {
  /** Peak rotation rate in deg/s. Defaults to 600. */
  peak?: number;
  /** Which rotation axis the pulse is on. Defaults to `alpha` (around x, a bowling swing). */
  axis?: "alpha" | "beta" | "gamma";
  /** Length of the pulse in ms. Defaults to 300. */
  durationMs?: number;
  /** Still time held before and after the pulse, in ms. Defaults to 200. */
  paddingMs?: number;
}

export interface SyntheticStillOptions extends SyntheticOptions {
  /** Defaults to 1000 ms. */
  durationMs?: number;
}

const DEFAULT_GRAVITY: TraceVector = [0, G * Math.SQRT1_2, G * Math.SQRT1_2];

const round = (value: number) => Math.round(value * 1000) / 1000 + 0;

const roundVector = (v: TraceVector): TraceVector => [round(v[0]), round(v[1]), round(v[2])];

/** Builds rows every `intervalMs` from 0 to `durationMs`, with `rotation(t)` as the only signal. */
function build(
  gesture: Trace["gesture"],
  durationMs: number,
  rotation: (t: number) => TraceVector,
  options: SyntheticOptions,
  events: number,
  marks: Trace["marks"],
): Trace {
  const {
    intervalMs = 1000 / 60,
    gravity = DEFAULT_GRAVITY,
    rawSigns = "w3c",
    gyroscope = true,
    platform = "android",
    label = `synthetic-${gesture}`,
  } = options;
  const sign = rawSigns === "inverted" ? -1 : 1;
  const acceleration = roundVector([0, 0, 0]);
  const withGravity = roundVector([gravity[0] * sign, gravity[1] * sign, gravity[2] * sign]);
  const samples: TraceSampleRow[] = [];
  // The epsilon keeps 1000 / (1000 / 60) at 60 samples despite floating point.
  const count = Math.floor(durationMs / intervalMs + 1e-9) + 1;
  for (let i = 0; i < count; i++) {
    const t = i * intervalMs;
    samples.push([
      round(t),
      round(intervalMs),
      acceleration,
      withGravity,
      gyroscope ? roundVector(rotation(t)) : null,
    ]);
  }
  return {
    v: 1,
    gesture,
    label,
    platform,
    device: "synthetic",
    recordedAt: "1970-01-01",
    rawSigns,
    expect: { events },
    marks,
    samples,
  };
}

/** A phone held still: zero rotation rate and constant gravity. Nothing should fire. */
function still(options: SyntheticStillOptions = {}): Trace {
  const { durationMs = 1000 } = options;
  return build("still", durationMs, () => [0, 0, 0], options, 0, []);
}

/**
 * One swing: a half-sine rotation rate pulse reaching `peak` on `axis`, with the grip held from the
 * first sample to the last.
 */
function swing(options: SyntheticSwingOptions = {}): Trace {
  const { peak = 600, axis = "alpha", durationMs = 300, paddingMs = 200 } = options;
  const total = durationMs + 2 * paddingMs;
  const index = { alpha: 0, beta: 1, gamma: 2 }[axis];
  const rotation = (t: number): TraceVector => {
    const phase = (t - paddingMs) / durationMs;
    const value = phase > 0 && phase < 1 ? peak * Math.sin(Math.PI * phase) : 0;
    const out: TraceVector = [0, 0, 0];
    out[index] = value;
    return out;
  };
  return build("swing", total, rotation, options, 1, [
    [0, "grip-down"],
    [total, "grip-up"],
  ]);
}

/** Builders for synthetic traces. */
export const synthetic = { still, swing };
