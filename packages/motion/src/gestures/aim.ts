/**
 * Aim (docs/architecture/motion.md, "Aim (CC-5.5)"): a stable pointer for Target Range, Double Top
 * and Duck Season.
 *
 * - `createAimDetector` turns the pose tracker's readings into `{ yaw, pitch }`, −1 to 1, relative
 *   to the recentre point. It is pure: time comes only from the readings.
 * - `createAimSender` samples the latest aim at most 15 times a second and sends the samples packed
 *   through the CC-3.6 input stream, which allows at most 4 messages a second.
 * - `fallbacks/aim.ts` is the drag pad that emits the same readings on phones without a gyroscope.
 *
 * ```ts
 * const tracker = createPoseTracker(calibration);   // one per controller
 * const aim = createAimDetector();
 * const sender = createAimSender(stream);          // the game's one input stream
 * aim.on((reading) => sender.update(reading));
 * adapter.start((sample) => aim.push(tracker.push(sample)));
 * // A shot carries the aim at the moment of firing (motion.md, "Fitting the input budget", rule 3):
 * stream.fire({ type: "shot", payload: { aim: aim.aim() } }, event.timeStamp);
 * ```
 */
import type { ClockScheduler } from "@couchcade/game-sdk/clock";
import {
  AIM_SAMPLES_PER_MESSAGE,
  AIM_SAMPLES_PER_SECOND,
  type Aim,
  type InputStream,
} from "@couchcade/game-sdk/input";
import type { PoseReading } from "../calibration/pose.ts";
import { rotate, vec } from "../calibration/vector.ts";

/** Degrees of yaw that map to ±1 (game may tune). */
export const AIM_YAW_RANGE_DEG = 25;
/** Degrees of pitch that map to ±1 (game may tune). */
export const AIM_PITCH_RANGE_DEG = 15;
/** Time between two aim samples: 15 per second. */
export const AIM_SAMPLE_INTERVAL_MS = 1000 / AIM_SAMPLES_PER_SECOND;
/** A sample that moved less than this on both axes since the last one sent is skipped. */
export const AIM_MIN_STEP = 0.01;

/** The aim at one moment: yaw and pitch from −1 to 1, and the local event or sample time in ms. */
export interface AimReading extends Aim {
  t: number;
}

export type AimListener = (reading: AimReading) => void;

/**
 * What the motion detector and the drag fallback share. A game can't tell them apart: both emit
 * `AimReading`s and both answer `aim()` with the same `{ yaw, pitch }` shape.
 */
export interface AimSource<TInput> {
  /** Feeds one input: a pose reading for the detector, a pointer point for the drag pad. */
  push(input: TInput): void;
  /**
   * Makes the current aim the centre, so it reads `{ yaw: 0, pitch: 0 }`. `t` is the time of the
   * recentre (a tap's `timeStamp`), defaulting to the time of the latest input.
   */
  recentre(t?: number): void;
  /** Forgets the recentre point and the aim. Listeners stay. */
  reset(): void;
  /** The current aim, rounded to 2 decimals. `{ yaw: 0, pitch: 0 }` before any input. */
  aim(): Aim;
  /** Called whenever the rounded aim changes. Returns a function that removes the listener. */
  on(listener: AimListener): () => void;
}

export interface AimRangeOptions {
  /** Degrees of yaw that map to ±1. Defaults to 25. */
  yawRangeDeg?: number;
  /** Degrees of pitch that map to ±1. Defaults to 15. */
  pitchRangeDeg?: number;
}

/** A trace mark. Only `recentre` moves the aim; grip marks are ignored. */
export interface AimMark {
  type: "recentre" | "grip-down" | "grip-up";
  t: number;
}

export interface AimDetector extends AimSource<PoseReading> {
  /** Applies a trace mark at its time. */
  mark(event: AimMark): void;
}

const DEG = 180 / Math.PI;

/** The phone points with its top edge, like a remote aimed at the TV. */
const TOP_EDGE = vec(0, 1, 0);

/** Below this horizontal length the top edge points straight up or down and has no heading. */
const MIN_HORIZONTAL = 1e-6;

/**
 * Aim from the pose tracker (motion.md, "Aim", detection rules 1 to 5):
 *
 * - `yaw` is the change in the top edge's heading around up (motion Z) since the recentre point,
 *   positive to the right. `pitch` is the change in the top edge's elevation, positive up. Both are
 *   measured around world axes, so rolling the wrist doesn't move the aim.
 * - ±25° of yaw and ±15° of pitch map to ±1, clamped, rounded to 2 decimals.
 * - Until `recentre()` is called, the first reading is the recentre point.
 *
 * Feed it what the controller's one pose tracker returns: `aim.push(tracker.push(sample))`. The
 * tracker keeps pitch honest with gravity. Yaw drifts slowly, which recentring fixes.
 */
export function createAimDetector(options: AimRangeOptions = {}): AimDetector {
  const { yawRangeDeg = AIM_YAW_RANGE_DEG, pitchRangeDeg = AIM_PITCH_RANGE_DEG } = options;
  const output = createAimOutput();

  let centre: { heading: number; elevation: number } | null = null;
  let heading = 0;
  let elevation = 0;
  let lastT: number | null = null;

  const measure = (reading: PoseReading) => {
    const top = rotate(reading.orientation, TOP_EDGE);
    const horizontal = Math.hypot(top.x, top.y);
    if (horizontal >= MIN_HORIZONTAL) heading = Math.atan2(top.x, top.y) * DEG;
    elevation = Math.atan2(top.z, horizontal) * DEG;
  };

  const detector: AimDetector = {
    push(reading) {
      measure(reading);
      lastT = reading.t;
      centre ??= { heading, elevation };
      const yaw = wrapDegrees(heading - centre.heading) / yawRangeDeg;
      const pitch = (elevation - centre.elevation) / pitchRangeDeg;
      output.set(reading.t, yaw, pitch);
    },
    recentre(t) {
      if (lastT === null) {
        // No pose yet: the next reading becomes the centre.
        centre = null;
        return;
      }
      centre = { heading, elevation };
      output.set(t ?? lastT, 0, 0);
    },
    mark(event) {
      if (event.type === "recentre") detector.recentre(event.t);
    },
    reset() {
      centre = null;
      lastT = null;
      heading = 0;
      elevation = 0;
      output.reset();
    },
    aim: output.aim,
    on: output.on,
  };
  return detector;
}

/** The rounded aim value and its listeners, shared by the detector and the drag fallback. */
export interface AimOutput {
  /** Clamps and rounds the raw values, and emits when the rounded aim changed. */
  set(t: number, yaw: number, pitch: number): void;
  reset(): void;
  aim(): Aim;
  on(listener: AimListener): () => void;
}

export function createAimOutput(): AimOutput {
  const listeners = new Set<AimListener>();
  let current: Aim = { yaw: 0, pitch: 0 };
  return {
    set(t, yaw, pitch) {
      const next = { yaw: roundUnit(yaw), pitch: roundUnit(pitch) };
      if (next.yaw === current.yaw && next.pitch === current.pitch) return;
      current = next;
      for (const listener of listeners) listener({ t, ...next });
    },
    reset() {
      current = { yaw: 0, pitch: 0 };
    },
    aim: () => ({ ...current }),
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One packed sample as it goes over the socket: offset from the input's `at`, yaw, pitch. */
export type PackedAimSample = [dtMs: number, yaw: number, pitch: number];

/** The input the sender streams. The game's input schema includes it. */
export interface AimInput {
  type: string;
  payload: { aim: PackedAimSample[] };
}

/**
 * Packs readings, oldest first, into the format `addAimSamples` on the host reads: at most the
 * newest 4, newest last, each `dtMs` its offset from the newest reading in whole milliseconds (so
 * 0 for the newest and negative for older ones). The newest reading's `t` is the input's
 * `eventTimeStamp`, so the send helper stamps `at` with it.
 */
export function packAim(readings: readonly AimReading[]): PackedAimSample[] {
  const window = readings.slice(-AIM_SAMPLES_PER_MESSAGE);
  const newest = window.at(-1);
  if (newest === undefined) return [];
  return window.map(({ t, yaw, pitch }) => [Math.round(t - newest.t) + 0, yaw, pitch]);
}

export interface AimSenderOptions {
  /** The input type. Defaults to `"aim"`. */
  type?: string;
  /** Local clock in ms, the time base of the readings. Defaults to `performance.now()`. */
  now?: () => number;
  /** Defaults to `setTimeout` and `clearTimeout`. */
  schedule?: ClockScheduler;
}

export interface AimSender {
  /** The latest aim. Called on every change; the sender takes a sample at most 15 times a second. */
  update(reading: AimReading): void;
  /** Forgets the samples and the last one sent, such as when a turn ends. The next sample goes out. */
  reset(): void;
  /** Resets and ignores every later call. */
  dispose(): void;
}

interface TimerGlobals {
  performance: { now(): number };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

// The lib tsconfig has no DOM types. Browsers and Node both provide these.
const globals = globalThis as unknown as TimerGlobals;

const scheduleTimeout: ClockScheduler = (callback, delayMs) => {
  const handle = globals.setTimeout(callback, delayMs);
  return () => globals.clearTimeout(handle);
};

/**
 * Streams aim through the game's CC-3.6 input stream (motion.md, "Aim", sending):
 *
 * - Samples the latest aim at most once per 66.7 ms (15 per second): at once when the last sample
 *   is at least that old, else when it is. One timer, set only while an update waits.
 * - Skips a sample that moved less than 0.01 on both axes from the last one sent, so a phone held
 *   still sends nothing.
 * - Every kept sample calls `stream.set` with the rolling window of the latest 4 kept samples,
 *   packed by `packAim`. The stream sends at most 4 messages a second and its latest-wins rule
 *   drops the windows in between, so each message carries the samples taken since the one before.
 */
export function createAimSender(
  stream: Pick<InputStream<AimInput>, "set">,
  options: AimSenderOptions = {},
): AimSender {
  const type = options.type ?? "aim";
  const now = options.now ?? (() => globals.performance.now());
  const schedule = options.schedule ?? scheduleTimeout;

  let window: AimReading[] = [];
  let latest: AimReading | null = null;
  let lastSampleAt = Number.NEGATIVE_INFINITY;
  let cancelTimer: (() => void) | null = null;
  let disposed = false;

  const takeSample = () => {
    const reading = latest;
    latest = null;
    if (reading === null) return;
    lastSampleAt = now();
    const last = window.at(-1);
    if (last !== undefined && !movedFrom(last, reading)) return;
    window = [...window, reading].slice(-AIM_SAMPLES_PER_MESSAGE);
    stream.set({ type, payload: { aim: packAim(window) } }, reading.t);
  };

  // Timers may round their delay, so a timer that fires early waits again rather than sampling.
  const pump = () => {
    if (disposed || cancelTimer !== null || latest === null) return;
    const waitMs = lastSampleAt + AIM_SAMPLE_INTERVAL_MS - now();
    if (waitMs <= 0) {
      takeSample();
      return;
    }
    cancelTimer = schedule(() => {
      cancelTimer = null;
      pump();
    }, Math.ceil(waitMs));
  };

  const reset = () => {
    cancelTimer?.();
    cancelTimer = null;
    window = [];
    latest = null;
  };

  return {
    update(reading) {
      if (disposed) return;
      latest = reading;
      pump();
    },
    reset,
    dispose() {
      reset();
      disposed = true;
    },
  };
}

// Aim values are rounded to 2 decimals, so a real step is 0.01 give or take float error.
const STEP_TOLERANCE = 1e-9;

function movedFrom(last: Aim, next: Aim): boolean {
  const step = AIM_MIN_STEP - STEP_TOLERANCE;
  return Math.abs(next.yaw - last.yaw) >= step || Math.abs(next.pitch - last.pitch) >= step;
}

/** Clamped to −1..1 and rounded to 2 decimals, without `-0`. */
function roundUnit(value: number): number {
  const clamped = Math.min(1, Math.max(-1, value));
  return Math.round(clamped * 100) / 100 + 0;
}

/** An angle difference in degrees, wrapped to −180..180. */
function wrapDegrees(degrees: number): number {
  return degrees - 360 * Math.round(degrees / 360);
}
