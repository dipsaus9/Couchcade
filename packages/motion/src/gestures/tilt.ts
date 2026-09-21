/**
 * Tilt (docs/architecture/motion.md, "Tilt (CC-5.7)"): a steering vector for Bumper Sumo, and
 * Paddle Panic's optional tilt.
 *
 * - `createTiltDetector` reads the controller's one pose tracker and emits how far the current
 *   pose has turned away from the rest pose captured at calibration, as a normalised `{ x, y }`
 *   with a dead zone. It is pure: time comes only from the readings.
 * - `createTiltSender` streams tilt samples through the game SDK's `InputChannel` with `set`
 *   (docs/architecture/realtime-link.md, "Game SDK API sketch"), so only changes go out.
 * - `fallbacks/tilt.ts` has the joystick adapter that turns a drag vector shaped like
 *   `CcJoystick`'s (`@couchcade/ui`, CC-4.5) into the same shape, for phones without a gyroscope
 *   and players who chose touch.
 *
 * ```ts
 * const tracker = createPoseTracker(calibration);   // one per controller
 * const tilt = createTiltDetector();
 * const sender = createTiltSender(input);           // the controller's one InputChannel
 * tilt.on((reading) => sender.update(reading));
 * adapter.start((sample) => tilt.push(tracker.push(sample)));
 * ```
 */
import type { GameInput, InputChannel } from "@couchcade/game-sdk/contract";
import type { PoseReading } from "../calibration/pose.ts";
import { conjugate, multiply, type Quaternion, rotate, vec } from "../calibration/vector.ts";
import type { Vec3 } from "../sensors/types.ts";

/** Degrees of tilt that map to ±1 on both axes (game may tune). */
export const TILT_FULL_DEG = 25;
/** Radial dead zone around rest, 0..1 of full scale. Inside it the value is `{ x: 0, y: 0 }`. */
export const TILT_DEAD_ZONE = 0.15;
/** Values are rounded to this fraction. */
export const TILT_ROUND_TO = 0.05;
/** Linear acceleration over this, in m/s², holds the last value (a shake or a bump). */
export const TILT_HOLD_ACCELERATION = 12;
/** How long a hold lasts after the acceleration last crossed `TILT_HOLD_ACCELERATION`, in ms. */
export const TILT_HOLD_MS = 200;

/** Tilt as games put it in their input payloads. */
export interface Tilt {
  /** Tilt left and right, −1 to 1. Positive when the right edge dips. */
  x: number;
  /** Tilt away and towards, −1 to 1. Positive when the top edge dips away from the player. */
  y: number;
}

/** One tilt reading: the value and the local sample or event time it was measured at, in ms. */
export interface TiltReading extends Tilt {
  t: number;
}

/**
 * Receives the tilt whenever the rounded value changes. Pass `t` as the input stream's
 * `eventTimeStamp`, the same way aim does.
 */
export type TiltListener = (reading: TiltReading) => void;

/** What the motion detector and the joystick fallback share. A game can't tell them apart. */
export interface TiltSource<TInput> {
  /** Feeds one input: a pose reading for the detector, a drag vector for the joystick pad. */
  push(input: TInput): void;
  /** Forgets the rest pose and the current tilt. Listeners stay. */
  reset(): void;
  /** The current tilt, rounded. `{ x: 0, y: 0 }` before any input. */
  tilt(): Tilt;
  /** Called whenever the rounded tilt changes. Returns a function that removes the listener. */
  on(listener: TiltListener): () => void;
}

export interface TiltOutputOptions {
  /** Defaults to `TILT_DEAD_ZONE`. */
  deadZone?: number;
}

export type TiltDetector = TiltSource<PoseReading>;

const DEG = 180 / Math.PI;

/** The device's own screen-normal axis, fixed relative to the phone. */
const DEVICE_UP = vec(0, 0, 1);
const MOTION_UP_G = 9.81;

export interface TiltDetectorOptions extends TiltOutputOptions {
  /** Degrees of tilt that map to ±1. Defaults to `TILT_FULL_DEG` (game may tune). */
  fullScaleDeg?: number;
  /** Defaults to `TILT_HOLD_ACCELERATION`. */
  holdAcceleration?: number;
  /** Defaults to `TILT_HOLD_MS`. */
  holdMs?: number;
}

/**
 * Tilt from the pose tracker (motion.md, "Tilt", detection rules 1 to 5):
 *
 * 1. Tilt is how far the current pose has turned from the rest pose captured at the first
 *    reading: `x` is the roll around the forward axis (positive when the right edge dips), `y`
 *    is the pitch around the right axis (positive when the top edge dips away from the player),
 *    read from where the device's own up axis currently points relative to rest.
 * 2. 25° of tilt is full scale.
 * 3. A radial dead zone of 0.15 around rest: inside it the value is `{ x: 0, y: 0 }`, outside it
 *    the length is rescaled from 0.15..1 to 0..1.
 * 4. Rounded to 0.05.
 * 5. While the linear acceleration is over 12 m/s² (a shake or a bump), tilt holds its last value
 *    for 200 ms after it drops back, so a dash doesn't jerk the steering.
 */
export function createTiltDetector(options: TiltDetectorOptions = {}): TiltDetector {
  const {
    fullScaleDeg = TILT_FULL_DEG,
    holdAcceleration = TILT_HOLD_ACCELERATION,
    holdMs = TILT_HOLD_MS,
  } = options;
  const output = createTiltOutput(options);

  let rest: Quaternion | null = null;
  let heldUntil = Number.NEGATIVE_INFINITY;

  return {
    push(reading) {
      rest ??= reading.orientation;

      const accel = linearAcceleration(reading);
      if (accel !== null && accel > holdAcceleration) heldUntil = reading.t + holdMs;
      if (reading.t < heldUntil) return;

      const delta = multiply(conjugate(rest), reading.orientation);
      const up = rotate(delta, DEVICE_UP);
      const roll = Math.atan2(up.x, up.z) * DEG;
      const pitch = Math.atan2(up.y, up.z) * DEG;
      output.set(reading.t, roll / fullScaleDeg, pitch / fullScaleDeg);
    },
    reset() {
      rest = null;
      heldUntil = Number.NEGATIVE_INFINITY;
      output.reset();
    },
    tilt: output.tilt,
    on: output.on,
  };
}

/** The rounded tilt value and its listeners, shared by the detector and the joystick fallback. */
export interface TiltOutput {
  /** `x` and `y` before the dead zone, rescaling and rounding: raw units where 1 is full scale. */
  set(t: number, x: number, y: number): void;
  reset(): void;
  tilt(): Tilt;
  on(listener: TiltListener): () => void;
}

/**
 * Applies tilt's shared dead zone, rescaling and rounding (motion.md, "Tilt", rules 3 and 4) to a
 * raw `{ x, y }` and emits only when the rounded value changes.
 */
export function createTiltOutput(options: TiltOutputOptions = {}): TiltOutput {
  const { deadZone = TILT_DEAD_ZONE } = options;
  const listeners = new Set<TiltListener>();
  let current: Tilt = { x: 0, y: 0 };
  return {
    set(t, x, y) {
      const next = applyDeadZone(x, y, deadZone);
      if (next.x === current.x && next.y === current.y) return;
      current = next;
      for (const listener of listeners) listener({ t, ...next });
    },
    reset() {
      current = { x: 0, y: 0 };
    },
    tilt: () => ({ ...current }),
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The input `createTiltSender` streams: one tilt sample, matching the Game SDK API sketch. The
 * payload is spelled out (not `Tilt`) because an `interface` has no implicit index signature, so
 * `Tilt` alone wouldn't satisfy `GameInput`'s `JsonValue` payload -- the same reason `AimInput`
 * spells out its payload too.
 */
export type TiltInput = { type: string; payload: { x: number; y: number } };

export interface TiltSenderOptions {
  /** The input type. Defaults to `"tilt"`. */
  type?: string;
}

export interface TiltSender {
  /** The latest tilt. Streamed at once unless it's the same value already sent. */
  update(reading: TiltReading): void;
  /** Forgets the last sample sent, so the next update always goes out. */
  reset(): void;
  /** Resets and ignores every later call. */
  dispose(): void;
}

/**
 * Streams tilt through the controller's `InputChannel` (docs/architecture/realtime-link.md,
 * "Game SDK API sketch"): one call to `channel.stream` per changed sample (AC#2 -- through
 * `input.stream`, not the CC-3.6 batching helper directly). Pacing to the direct link's rate and
 * packing for the relay path both live in the channel, so the sender itself never batches or
 * times anything, the same as `createAimSender`.
 *
 * Skips a sample equal to the last one sent, so a phone held still sends nothing further -- the
 * channel's own direct-path dedupe only compares JSON, but nothing here should reach it twice
 * given `createTiltOutput` already only emits on change; this is the same belt-and-braces guard
 * `createAimSender` keeps for the relay path, which packs every call it's given.
 */
export function createTiltSender<TInput extends GameInput = TiltInput>(
  channel: Pick<InputChannel<TInput>, "stream">,
  options: TiltSenderOptions = {},
): TiltSender {
  const type = options.type ?? "tilt";

  let lastSent: Tilt | null = null;
  let disposed = false;

  return {
    update(reading) {
      if (disposed) return;
      const payload: Tilt = { x: reading.x, y: reading.y };
      if (lastSent !== null && lastSent.x === payload.x && lastSent.y === payload.y) return;
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

/**
 * Radial dead zone (motion.md, "Tilt", rule 3): inside `deadZone` the vector is zero; outside, its
 * length is rescaled from `deadZone..1` to `0..1` along the same direction (so the stick doesn't
 * jump at the edge), clamped at 1, then each axis rounded to `TILT_ROUND_TO`.
 */
function applyDeadZone(x: number, y: number, deadZone: number): Tilt {
  const magnitude = Math.hypot(x, y);
  if (magnitude < deadZone) return { x: 0, y: 0 };
  const scale = Math.min(1, (magnitude - deadZone) / (1 - deadZone)) / magnitude;
  return { x: roundTo(x * scale), y: roundTo(y * scale) };
}

/** Rounded to `TILT_ROUND_TO`, without `-0`. */
function roundTo(value: number): number {
  return Math.round(value / TILT_ROUND_TO) * TILT_ROUND_TO + 0;
}

/**
 * Linear acceleration magnitude in m/s²: the platform's `acceleration` when it has one, else the
 * gravity-including acceleration minus 9.81 m/s² of up. `null` when neither is present. Shared
 * pattern with swing and flick's own `linearAcceleration` helpers.
 */
function linearAcceleration(reading: PoseReading): number | null {
  if (reading.acceleration) return length(reading.acceleration);
  const g = reading.gravityAcceleration;
  return g ? length(vec(g.x, g.y, g.z - MOTION_UP_G)) : null;
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}
