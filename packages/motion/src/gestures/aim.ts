/**
 * Aim (docs/architecture/motion.md, "Aim (CC-5.5)"): a stable pointer for Target Range, Double Top
 * and Duck Season.
 *
 * - `createAimDetector` turns the pose tracker's readings into `{ yaw, pitch }`, −1 to 1, relative
 *   to the recentre point. It is pure: time comes only from the readings.
 * - `createAimSender` skips a sample that barely moved, then streams every kept one through the
 *   game's `InputChannel` (docs/architecture/realtime-link.md, "Game SDK API sketch"). Pacing and
 *   packing for the direct link and the relay path both live in the channel now, not here.
 * - `fallbacks/aim.ts` is the drag pad that emits the same readings on phones without a gyroscope.
 *
 * ```ts
 * const tracker = createPoseTracker(calibration);   // one per controller
 * const aim = createAimDetector();
 * const sender = createAimSender(input);           // the controller's one InputChannel
 * aim.on((reading) => sender.update(reading));
 * adapter.start((sample) => aim.push(tracker.push(sample)));
 * // A shot carries the aim at the moment of firing (motion.md, "Fitting the input budget", rule 3):
 * input.fire({ type: "shot", payload: { aim: aim.aim() } }, event.timeStamp);
 * ```
 */
import type { GameInput, InputChannel } from "@couchcade/game-sdk/contract";
import type { Aim } from "@couchcade/game-sdk/input";
import type { PoseReading } from "../calibration/pose.ts";
import { rotate, vec } from "../calibration/vector.ts";

/** Degrees of yaw that map to ±1 (game may tune). */
export const AIM_YAW_RANGE_DEG = 25;
/** Degrees of pitch that map to ±1 (game may tune). */
export const AIM_PITCH_RANGE_DEG = 15;
/** A sample that moved less than this on both axes since the last one sent is skipped. */
export const AIM_MIN_STEP = 0.001;

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
  /** The current aim, rounded to 3 decimals. `{ yaw: 0, pitch: 0 }` before any input. */
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
 * - ±25° of yaw and ±15° of pitch map to ±1, clamped, rounded to 3 decimals.
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

/** The input `createAimSender` streams: one aim sample, matching the Game SDK API sketch. */
export type AimInput = { type: string; payload: { yaw: number; pitch: number } };

export interface AimSenderOptions {
  /** The input type. Defaults to `"aim"`. */
  type?: string;
}

export interface AimSender {
  /** The latest aim. Streamed at once unless it barely moved from the last one sent. */
  update(reading: AimReading): void;
  /** Forgets the last sample sent, such as when a turn ends. The next update always goes out. */
  reset(): void;
  /** Resets and ignores every later call. */
  dispose(): void;
}

/**
 * Streams aim through the controller's `InputChannel` (docs/architecture/realtime-link.md, "Game
 * SDK API sketch"): one call to `channel.stream` per aim sample, rounded to 3 decimals. Pacing to
 * the direct link's rate and packing for the relay path both live in the channel now, so the sender
 * itself no longer batches or times anything.
 *
 * Skips a sample that moved less than `AIM_MIN_STEP` on both axes from the last one sent, so a
 * phone held still sends nothing.
 */
export function createAimSender<TInput extends GameInput = AimInput>(
  channel: Pick<InputChannel<TInput>, "stream">,
  options: AimSenderOptions = {},
): AimSender {
  const type = options.type ?? "aim";

  let lastSent: Aim | null = null;
  let disposed = false;

  return {
    update(reading) {
      if (disposed) return;
      if (lastSent !== null && !movedFrom(lastSent, reading)) return;
      const payload: Aim = { yaw: round3(reading.yaw), pitch: round3(reading.pitch) };
      lastSent = payload;
      channel.stream({ type, payload } as unknown as TInput, reading.t);
    },
    reset() {
      lastSent = null;
    },
    dispose() {
      lastSent = null;
      disposed = true;
    },
  };
}

// Aim values are rounded to 3 decimals, so a real step is 0.001 give or take float error.
const STEP_TOLERANCE = 1e-9;

function movedFrom(last: Aim, next: Aim): boolean {
  const step = AIM_MIN_STEP - STEP_TOLERANCE;
  return Math.abs(next.yaw - last.yaw) >= step || Math.abs(next.pitch - last.pitch) >= step;
}

/** Clamped to −1..1 and rounded to 3 decimals, without `-0`. */
function roundUnit(value: number): number {
  const clamped = Math.min(1, Math.max(-1, value));
  return round3(clamped) + 0;
}

/** Rounds to 3 decimals, without `-0`. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

/** An angle difference in degrees, wrapped to −180..180. */
function wrapDegrees(degrees: number): number {
  return degrees - 360 * Math.round(degrees / 360);
}
