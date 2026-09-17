/**
 * Swing (docs/architecture/motion.md, "Swing (CC-5.4)"): one event per swing for Strike Night,
 * Putt Club, Dinger Derby and Bandeja.
 *
 * - `createSwingDetector` reads the controller's one pose tracker and emits `Swing`s while the grip
 *   is held, the way Wii Sports bowling and golf only count a swing while B or A is held. It is
 *   pure: time comes only from the readings and the grip marks.
 * - `fallbacks/swing.ts` has the swipe and tap pads that emit the same `Swing` on touch.
 *
 * ```ts
 * const tracker = createPoseTracker(calibration);        // one per controller
 * const swing = createSwingDetector({ emitOn: "release" });
 * swing.on((event, t) => stream.fire({ type: "bowl", payload: event }, t));
 * adapter.start((sample) => swing.push(tracker.push(sample)));
 * grip.onpointerdown = (e) => swing.mark({ type: "grip-down", t: e.timeStamp });
 * grip.onpointerup = (e) => swing.mark({ type: "grip-up", t: e.timeStamp });
 * ```
 */
import { toHostTime } from "@couchcade/game-sdk/clock";
import { FORWARD_MIN_HORIZONTAL } from "../calibration/frame.ts";
import type { PoseReading } from "../calibration/pose.ts";
import { conjugate, length, type Quaternion, rotate, vec } from "../calibration/vector.ts";
import type { TraceMarkType } from "../sensors/trace.ts";
import type { Vec3 } from "../sensors/types.ts";

/**
 * A swing starts when the rotation rate magnitude passes this, in deg/s. Holding a phone and
 * shifting weight stays well under it; a lazy arm swing is already several hundred.
 */
export const SWING_START_RATE = 120;
/** A swing ends once the rotation rate stays under this, in deg/s, for `SWING_END_QUIET_MS`. */
export const SWING_END_RATE = 60;
/**
 * How long the rate must stay under `SWING_END_RATE` to end a swing, in ms. Six samples at 60 Hz,
 * so the brief stop at the top of a backswing or the turn of a follow-through doesn't split it.
 */
export const SWING_END_QUIET_MS = 100;
/**
 * A swing whose peak is under this, in deg/s, emits nothing (game may tune). Twice the start rate,
 * so a flinch or a wobble that crosses the start rate never becomes a swing. It is speed 0.
 */
export const SWING_MIN_PEAK = 240;
/**
 * The peak rate that gives full speed, in deg/s (game may tune). A firm, controlled swing. Owner
 * decision 3: swinging harder adds nothing, because wild swings are how phones hit TVs.
 */
export const SWING_FULL_PEAK = 900;
/**
 * Linear acceleration is summed over this long before the peak, in ms, to find which way the phone
 * was travelling. About the forward half of a firm swing, before the arm starts to decelerate.
 */
export const SWING_ANGLE_WINDOW_MS = 200;
/**
 * The wrist twist is averaged over this long up to the peak, in ms. Spin comes from the twist
 * around release, as in Wii Sports bowling, not from the whole swing.
 */
export const SWING_SPIN_WINDOW_MS = 120;
/** A mean twist rate around the phone's long axis of this, in deg/s, is full spin. */
export const SWING_FULL_SPIN_RATE = 540;
/** `emitOn: "release"`: a grip-up emits the last swing that peaked this long before it, in ms. */
export const SWING_RELEASE_WINDOW_MS = 300;
/**
 * `emitOn: "peak"`: a swing that starts less than this after the last emitted one ended is ignored, in ms,
 * so the arm bouncing back after a follow-through isn't a second swing.
 */
export const SWING_COOLDOWN_MS = 400;

/** One swing as games put it in their input payloads. */
export interface Swing {
  /** How hard the swing was: 0 at `minPeak`, 1 at `fullPeak`, rounded to 2 decimals. */
  speed: number;
  /**
   * Which way the phone was travelling at the peak, in whole degrees from −180 to 180 in the
   * horizontal plane. 0 is forward (where the phone faced at grip-down), positive is to the right.
   */
  angle: number;
  /** Wrist twist around the phone's long axis near the peak, −1 to 1. Positive is clockwise as the player sees it. */
  spin: number;
  /** When the swing was fastest, in room time, whole ms. */
  peakAt: number;
}

/**
 * Receives each swing and the local time of its peak, in the same time base as the samples and
 * pointer events. Pass that as the input stream's `eventTimeStamp`, so the input's `at` is when the
 * player acted.
 */
export type SwingListener = (swing: Swing, t: number) => void;

/** When a swing is emitted. */
export type SwingEmitOn = "release" | "peak";

/** What the motion detector and the touch fallbacks share. A game can't tell them apart. */
export interface SwingSource<TInput> {
  /** Feeds one input: a pose reading for the detector, a pointer point for the pads. */
  push(input: TInput): void;
  /** Forgets the grip, any swing in progress and the cooldown. Listeners stay. */
  reset(): void;
  /** Called with every swing. Returns a function that removes the listener. */
  on(listener: SwingListener): () => void;
}

/** A trace mark or a grip button event. `recentre` is ignored. */
export interface SwingMark {
  type: TraceMarkType;
  t: number;
}

export interface SwingDetector extends SwingSource<PoseReading> {
  /** Applies a grip mark at its time, before any reading later than `t`. */
  mark(event: SwingMark): void;
}

export interface SwingOutputOptions {
  /**
   * Local sample or event time (`event.timeStamp`) to room time. Defaults to the shared room clock:
   * `toHostTime(performance.timeOrigin + t)`, as the send helper stamps `at`.
   */
  toRoomTime?: (t: number) => number;
}

export interface SwingDetectorOptions extends SwingOutputOptions {
  /** `"release"` emits at grip-up (Strike Night), `"peak"` when each swing ends. Defaults to `"peak"`. */
  emitOn?: SwingEmitOn;
  /** Defaults to `SWING_MIN_PEAK` (game may tune). */
  minPeak?: number;
  /** Defaults to `SWING_FULL_PEAK` (game may tune). */
  fullPeak?: number;
  /** Defaults to `SWING_START_RATE`. */
  startRate?: number;
  /** Defaults to `SWING_END_RATE`. */
  endRate?: number;
  /** Defaults to `SWING_END_QUIET_MS`. */
  endQuietMs?: number;
  /** Defaults to `SWING_ANGLE_WINDOW_MS`. */
  angleWindowMs?: number;
  /** Defaults to `SWING_SPIN_WINDOW_MS`. */
  spinWindowMs?: number;
  /** Defaults to `SWING_FULL_SPIN_RATE`. */
  fullSpinRate?: number;
  /** Defaults to `SWING_RELEASE_WINDOW_MS`. */
  releaseWindowMs?: number;
  /** Defaults to `SWING_COOLDOWN_MS`. */
  cooldownMs?: number;
}

/** A swing's measured values before rounding. */
export interface RawSwing {
  speed: number;
  angle: number;
  spin: number;
  /** Local time of the peak. */
  t: number;
}

/** Rounds swings, converts the peak to room time and calls the listeners. Shared with the fallbacks. */
export interface SwingOutput {
  emit(swing: RawSwing): void;
  on(listener: SwingListener): () => void;
}

interface PerformanceGlobals {
  performance: { timeOrigin: number };
}

const localToRoomTime = (t: number): number =>
  toHostTime((globalThis as unknown as PerformanceGlobals).performance.timeOrigin + t);

export function createSwingOutput(options: SwingOutputOptions = {}): SwingOutput {
  const { toRoomTime = localToRoomTime } = options;
  const listeners = new Set<SwingListener>();
  return {
    emit({ speed, angle, spin, t }) {
      const swing: Swing = {
        speed: roundTo(clamp(speed, 0, 1), 100),
        angle: roundTo(clamp(wrapDegrees(angle), -180, 180), 1),
        spin: roundTo(clamp(spin, -1, 1), 100),
        peakAt: Math.round(toRoomTime(t)) + 0,
      };
      for (const listener of listeners) listener({ ...swing }, t);
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One reading kept for the angle and spin windows. */
interface Entry {
  t: number;
  /** Linear acceleration times its time step, in the grip-down heading frame (m/s). */
  dv: Vec3;
  /** Twist rate around the phone's long axis (device `y`, `rotationRate.beta`), deg/s. */
  twist: number;
}

interface Candidate {
  startT: number;
  peak: number;
  peakT: number;
  angle: number;
  spin: number;
}

const DEG = 180 / Math.PI;

/** The device vector `y − z`, the calibration's "away from the player" (motion.md, "The motion frame"). */
const AWAY = vec(0, Math.SQRT1_2, -Math.SQRT1_2);
const X_AXIS = vec(1, 0, 0);
const MOTION_UP_G = 9.81;

/** Longest time step one reading stands for, in ms, like the pose tracker's cap. */
const MAX_STEP_MS = 50;

/** Below this summed velocity, in m/s, the direction is noise and the angle is 0. */
const MIN_VELOCITY = 1e-3;

/**
 * Swings from the pose tracker (motion.md, "Swing", detection rules 1 to 7):
 *
 * 1. Only listens between `grip-down` and `grip-up`. Grip-down captures the phone's heading (the
 *    same "away from the player" direction calibration uses) as forward for this grip.
 * 2. A swing starts when the rotation rate magnitude passes 120 deg/s and ends when it stays under
 *    60 deg/s for 100 ms, or at grip-up.
 * 3. The peak is the reading with the highest magnitude. A peak under 240 deg/s emits nothing.
 * 4. `speed = clamp((peak − 240) / (900 − 240), 0, 1)`.
 * 5. `angle = atan2(v.X, v.Y)`, with `v` the linear acceleration in the grip-down heading frame
 *    summed over the 200 ms up to the peak.
 * 6. `spin` is the mean `rotationRate.beta` (device `y`) over the 120 ms up to the peak, / 540.
 * 7. `"release"` emits at grip-up the last swing that peaked in the 300 ms before it. `"peak"` emits
 *    each swing as it ends, and ignores a swing starting within 400 ms of the end of the last one emitted.
 *    A grip-up ends a swing in progress, so in `"peak"` mode that swing still emits.
 */
export function createSwingDetector(options: SwingDetectorOptions = {}): SwingDetector {
  const {
    emitOn = "peak",
    minPeak = SWING_MIN_PEAK,
    fullPeak = SWING_FULL_PEAK,
    startRate = SWING_START_RATE,
    endRate = SWING_END_RATE,
    endQuietMs = SWING_END_QUIET_MS,
    angleWindowMs = SWING_ANGLE_WINDOW_MS,
    spinWindowMs = SWING_SPIN_WINDOW_MS,
    fullSpinRate = SWING_FULL_SPIN_RATE,
    releaseWindowMs = SWING_RELEASE_WINDOW_MS,
    cooldownMs = SWING_COOLDOWN_MS,
  } = options;
  const output = createSwingOutput(options);
  const historyMs = Math.max(angleWindowMs, spinWindowMs);

  let gripped = false;
  /** Heading of forward at grip-down, degrees; `null` until a reading after grip-down sets it. */
  let reference: number | null = null;
  let lastOrientation: Quaternion | null = null;
  let lastT: number | null = null;
  let history: Entry[] = [];
  let current: Candidate | null = null;
  let quietSince: number | null = null;
  /** `"release"`: the last swing over `minPeak` that ended during this grip. */
  let finished: Candidate | null = null;
  let lastEmitT = Number.NEGATIVE_INFINITY;

  const emit = (swing: Candidate) => {
    output.emit({
      speed: (swing.peak - minPeak) / (fullPeak - minPeak),
      angle: swing.angle,
      spin: swing.spin,
      t: swing.peakT,
    });
  };

  const endSwing = (t: number) => {
    const swing = current;
    current = null;
    quietSince = null;
    if (swing === null || swing.peak < minPeak) return;
    if (emitOn === "release") {
      finished = swing;
    } else if (swing.startT - lastEmitT >= cooldownMs) {
      lastEmitT = t;
      emit(swing);
    }
  };

  /** Angle and spin for a peak at `t`, from the readings kept in `history`. */
  const measure = (t: number) => {
    let v = vec(0, 0, 0);
    let twistSum = 0;
    let twists = 0;
    for (const entry of history) {
      if (entry.t > t) continue;
      if (entry.t > t - angleWindowMs) {
        v = vec(v.x + entry.dv.x, v.y + entry.dv.y, v.z + entry.dv.z);
      }
      if (entry.t > t - spinWindowMs) {
        twistSum += entry.twist;
        twists++;
      }
    }
    const angle = Math.hypot(v.x, v.y) < MIN_VELOCITY ? 0 : Math.atan2(v.x, v.y) * DEG;
    const spin = twists === 0 ? 0 : twistSum / twists / fullSpinRate;
    return { angle, spin };
  };

  const detector: SwingDetector = {
    push(reading) {
      const step = lastT === null ? 0 : Math.min(Math.max(reading.t - lastT, 0), MAX_STEP_MS);
      lastT = reading.t;
      lastOrientation = reading.orientation;
      if (!gripped) return;
      reference ??= headingOf(reading.orientation);

      const rate = reading.rotationRate;
      if (rate === null) return;
      const magnitude = length(rate);
      const twist = rotate(conjugate(reading.orientation), rate).y;
      const linear = linearAcceleration(reading);
      const dv = linear ? turnHeading(linear, -reference) : vec(0, 0, 0);
      const seconds = step / 1000;
      history.push({
        t: reading.t,
        dv: vec(dv.x * seconds, dv.y * seconds, dv.z * seconds),
        twist,
      });
      while ((history[0]?.t ?? reading.t) <= reading.t - historyMs) history.shift();

      if (current === null) {
        if (magnitude < startRate) return;
        current = { startT: reading.t, peak: 0, peakT: reading.t, angle: 0, spin: 0 };
      }
      if (magnitude > current.peak) {
        current.peak = magnitude;
        current.peakT = reading.t;
        Object.assign(current, measure(reading.t));
      }
      if (magnitude >= endRate) {
        quietSince = null;
        return;
      }
      quietSince ??= reading.t;
      if (reading.t - quietSince >= endQuietMs) endSwing(reading.t);
    },

    mark(event) {
      if (event.type === "grip-down") {
        if (gripped) return;
        gripped = true;
        finished = null;
        history = [];
        reference = lastOrientation ? headingOf(lastOrientation) : null;
        return;
      }
      if (event.type !== "grip-up" || !gripped) return;
      endSwing(event.t);
      gripped = false;
      reference = null;
      history = [];
      const swing = finished;
      finished = null;
      if (swing && event.t - swing.peakT <= releaseWindowMs) emit(swing);
    },

    reset() {
      gripped = false;
      reference = null;
      lastOrientation = null;
      lastT = null;
      history = [];
      current = null;
      quietSince = null;
      finished = null;
      lastEmitT = Number.NEGATIVE_INFINITY;
    },

    on: output.on,
  };
  return detector;
}

/**
 * Linear acceleration in the motion frame of the current pose: the platform's `acceleration` when
 * it has one, else the gravity-including acceleration minus 9.81 m/s² of up.
 */
function linearAcceleration(reading: PoseReading): Vec3 | null {
  if (reading.acceleration) return reading.acceleration;
  const g = reading.gravityAcceleration;
  return g ? vec(g.x, g.y, g.z - MOTION_UP_G) : null;
}

/**
 * The heading of the phone in degrees, positive to the right: where the horizontal part of the
 * device vector `y − z` points, as calibration picks forward. A phone on its side uses `+x` turned
 * a quarter turn back, the same fallback calibration uses.
 */
function headingOf(orientation: Quaternion): number {
  const away = rotate(orientation, AWAY);
  if (Math.hypot(away.x, away.y) >= FORWARD_MIN_HORIZONTAL) {
    return Math.atan2(away.x, away.y) * DEG;
  }
  const right = rotate(orientation, X_AXIS);
  return Math.atan2(right.x, right.y) * DEG - 90;
}

/** `v` turned around up by `degrees`, positive to the right. Turning by −heading makes heading forward. */
function turnHeading(v: Vec3, degrees: number): Vec3 {
  const a = degrees / DEG;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return vec(v.x * c + v.y * s, -v.x * s + v.y * c, v.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounded to `1 / factor`, without `-0`. */
function roundTo(value: number, factor: number): number {
  return Math.round(value * factor) / factor + 0;
}

/** An angle in degrees wrapped to −180..180. */
function wrapDegrees(degrees: number): number {
  return degrees - 360 * Math.round(degrees / 360);
}
