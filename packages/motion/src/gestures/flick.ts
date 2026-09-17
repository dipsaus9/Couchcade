/**
 * Flick (docs/architecture/motion.md, "Flick (CC-5.6)"): one throw event per dart for Double Top.
 *
 * - `createFlickDetector` reads the controller's one pose tracker and emits a `Flick` for a forward
 *   wrist snap while the throw grip is held. It is pure: time comes only from the readings and the
 *   grip marks.
 * - `fallbacks/flick.ts` has the swipe pad that emits the same `Flick` on touch.
 *
 * The throw input carries the aim at the moment of release, so the dart lands where the phone
 * pointed, not where the TV crosshair had got to (motion.md, "Fitting the input budget", rule 3):
 *
 * ```ts
 * const tracker = createPoseTracker(calibration);        // one per controller
 * const aim = createAimDetector();
 * const flick = createFlickDetector();
 * flick.on((event, t) => stream.fire({ type: "throw", payload: { flick: event, aim: aim.aim() } }, t));
 * adapter.start((sample) => {
 *   const reading = tracker.push(sample);
 *   aim.push(reading);
 *   flick.push(reading);
 * });
 * grip.onpointerdown = (e) => flick.mark({ type: "grip-down", t: e.timeStamp });
 * grip.onpointerup = (e) => flick.mark({ type: "grip-up", t: e.timeStamp });
 * ```
 */
import { toHostTime } from "@couchcade/game-sdk/clock";
import { FORWARD_MIN_HORIZONTAL } from "../calibration/frame.ts";
import type { PoseReading } from "../calibration/pose.ts";
import { cross, dot, length, type Quaternion, rotate, vec } from "../calibration/vector.ts";
import type { TraceMarkType } from "../sensors/trace.ts";
import type { Vec3 } from "../sensors/types.ts";

/**
 * A flick needs the top edge to pitch down faster than this, in deg/s (game may tune). It is
 * power 0. Lowering the phone calmly, or the drift of a steady aim, stays far under it.
 */
export const FLICK_MIN_RATE = 300;
/**
 * The pitch-down rate that gives full power, in deg/s. A firm wrist snap: flicking harder adds
 * nothing, the same safety rule as a firm swing (motion.md, "Safety", rule 2).
 */
export const FLICK_FULL_RATE = 1200;
/**
 * A snap also needs linear acceleration over this, in m/s², within `FLICK_ACCELERATION_WINDOW_MS`
 * of its peak. Turning the phone in place fast, without moving the hand, is not a throw.
 */
export const FLICK_MIN_ACCELERATION = 6;
/** How far either side of the peak the acceleration may come, in ms. */
export const FLICK_ACCELERATION_WINDOW_MS = 100;
/** Direction and wobble are measured over this long before the peak, in ms. */
export const FLICK_WINDOW_MS = 150;
/** The direction is clamped to this many degrees either side of straight. */
export const FLICK_MAX_DIRECTION = 30;
/** After a flick, the next one may start this long after its peak at the earliest, in ms. */
export const FLICK_COOLDOWN_MS = 800;

/** One throw as games put it in their input payloads. */
export interface Flick {
  /** How sharp the flick was: 0 at `minRate`, 1 at `fullRate`, rounded to 2 decimals. */
  power: number;
  /**
   * Sideways pull during the flick, relative to where the phone was aiming, in whole degrees from
   * −30 to 30. Positive is right.
   */
  direction: number;
  /** How much the wrist twisted or swerved instead of flicking cleanly, 0 to 1, rounded to 2 decimals. */
  wobble: number;
  /** The moment of release (the flick's peak), in room time, whole ms. */
  at: number;
}

/**
 * Receives each flick and the local time of its peak, in the same time base as the samples and
 * pointer events. Pass that as the input stream's `eventTimeStamp`, so the input's `at` is when the
 * player threw.
 */
export type FlickListener = (flick: Flick, t: number) => void;

/** What the motion detector and the touch fallback share. A game can't tell them apart. */
export interface FlickSource<TInput> {
  /** Feeds one input: a pose reading for the detector, a pointer point for the swipe pad. */
  push(input: TInput): void;
  /** Forgets the grip, any flick in progress and the cooldown. Listeners stay. */
  reset(): void;
  /** Called with every flick. Returns a function that removes the listener. */
  on(listener: FlickListener): () => void;
}

/** A trace mark or a grip button event. `recentre` is ignored. */
export interface FlickMark {
  type: TraceMarkType;
  t: number;
}

export interface FlickDetector extends FlickSource<PoseReading> {
  /** Applies a grip mark at its time, before any reading later than `t`. */
  mark(event: FlickMark): void;
}

export interface FlickOutputOptions {
  /**
   * Local sample or event time (`event.timeStamp`) to room time. Defaults to the shared room clock:
   * `toHostTime(performance.timeOrigin + t)`, as the send helper stamps `at`.
   */
  toRoomTime?: (t: number) => number;
  /** Defaults to `FLICK_MAX_DIRECTION`. */
  maxDirection?: number;
}

export interface FlickDetectorOptions extends FlickOutputOptions {
  /** Defaults to `FLICK_MIN_RATE` (game may tune). */
  minRate?: number;
  /** Defaults to `FLICK_FULL_RATE`. */
  fullRate?: number;
  /** Defaults to `FLICK_MIN_ACCELERATION`. */
  minAcceleration?: number;
  /** Defaults to `FLICK_ACCELERATION_WINDOW_MS`. */
  accelerationWindowMs?: number;
  /** Defaults to `FLICK_WINDOW_MS`. */
  windowMs?: number;
  /** Defaults to `FLICK_COOLDOWN_MS`. */
  cooldownMs?: number;
}

/** A flick's measured values before clamping and rounding. */
export interface RawFlick {
  power: number;
  /** Degrees, positive to the right. */
  direction: number;
  wobble: number;
  /** Local time of the peak. */
  t: number;
}

/** Clamps and rounds flicks, converts the peak to room time and calls the listeners. Shared with the fallback. */
export interface FlickOutput {
  emit(flick: RawFlick): void;
  on(listener: FlickListener): () => void;
}

interface PerformanceGlobals {
  performance: { timeOrigin: number };
}

const localToRoomTime = (t: number): number =>
  toHostTime((globalThis as unknown as PerformanceGlobals).performance.timeOrigin + t);

export function createFlickOutput(options: FlickOutputOptions = {}): FlickOutput {
  const { toRoomTime = localToRoomTime, maxDirection = FLICK_MAX_DIRECTION } = options;
  const listeners = new Set<FlickListener>();
  return {
    emit({ power, direction, wobble, t }) {
      const flick: Flick = {
        power: roundTo(clamp(power, 0, 1), 100),
        direction: roundTo(clamp(direction, -maxDirection, maxDirection), 1),
        wobble: roundTo(clamp(wobble, 0, 1), 100),
        at: Math.round(toRoomTime(t)) + 0,
      };
      for (const listener of listeners) listener({ ...flick }, t);
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One reading kept for the direction, wobble and acceleration windows. */
interface Entry {
  t: number;
  /** Pitch-down rate of the top edge, deg/s. */
  pitch: number;
  /** Squared rate around every axis but the pitch axis (yaw and roll together), (deg/s)². */
  offPitch: number;
  /** Heading change over this reading's time step, degrees, positive to the right. */
  yaw: number;
  /** Linear acceleration magnitude, m/s². */
  acceleration: number;
}

interface Candidate {
  peak: number;
  peakT: number;
  direction: number;
  wobble: number;
  /** Whether acceleration over the minimum came within the window around the current peak. */
  accelerated: boolean;
}

/** The phone points with its top edge, like a remote aimed at the TV (motion.md, "Aim", rule 1). */
const TOP_EDGE = vec(0, 1, 0);
/** The device vector `y − z`, the calibration's "away from the player" (motion.md, "The motion frame"). */
const AWAY = vec(0, Math.SQRT1_2, -Math.SQRT1_2);
const MOTION_UP_G = 9.81;

/** Longest time step one reading stands for, in ms, like the pose tracker's cap. */
const MAX_STEP_MS = 50;

/**
 * Flicks from the pose tracker (motion.md, "Flick", detection rules 1 to 6):
 *
 * 1. Only starts a flick between `grip-down` and `grip-up`.
 * 2. The pitch-down rate is the rotation rate around the horizontal axis to the right of where the
 *    top edge points (the calibration's `y − z` while the top edge points straight up or down). A
 *    flick starts when it passes 300 deg/s and ends when it drops back under, or at grip-up. The
 *    peak is its highest reading. It only counts with linear acceleration over 6 m/s² within 100 ms
 *    either side of the peak, so a flick is emitted once that acceleration has come, which may be
 *    just after grip-up when the thumb lets go as it throws.
 * 3. `power = clamp((peak − 300) / (1,200 − 300), 0, 1)`.
 * 4. `direction` is the change in the top edge's heading (where it points around up) over the
 *    150 ms up to the peak, positive to the right, clamped to ±30°. Twisting the phone around its
 *    long axis doesn't move the top edge, so it adds to wobble, not to direction.
 * 5. `wobble` is the RMS of the yaw and roll rates (the rate around every axis but the pitch axis)
 *    over the RMS of the pitch rate, over the same 150 ms, clamped to 1.
 * 6. One flick per grip. The next may start 800 ms after the last one's peak at the earliest.
 */
export function createFlickDetector(options: FlickDetectorOptions = {}): FlickDetector {
  const {
    minRate = FLICK_MIN_RATE,
    fullRate = FLICK_FULL_RATE,
    minAcceleration = FLICK_MIN_ACCELERATION,
    accelerationWindowMs = FLICK_ACCELERATION_WINDOW_MS,
    windowMs = FLICK_WINDOW_MS,
    cooldownMs = FLICK_COOLDOWN_MS,
  } = options;
  const output = createFlickOutput(options);
  const historyMs = Math.max(windowMs, accelerationWindowMs);

  let gripped = false;
  /** Whether this grip already threw. */
  let thrown = false;
  /** The horizontal pitch axis, a unit vector in the motion frame; `null` until a pose sets it. */
  let axis: Vec3 | null = null;
  let lastT: number | null = null;
  let history: Entry[] = [];
  /** A flick above `minRate` right now. */
  let current: Candidate | null = null;
  /** A flick that has ended and waits for its acceleration. */
  let ended: Candidate | null = null;
  let lastEmitT = Number.NEGATIVE_INFINITY;

  const emit = (flick: Candidate) => {
    thrown = true;
    lastEmitT = flick.peakT;
    output.emit({
      power: (flick.peak - minRate) / (fullRate - minRate),
      direction: flick.direction,
      wobble: flick.wobble,
      t: flick.peakT,
    });
  };

  /** Direction, wobble and earlier acceleration for a peak at `t`, from the readings in `history`. */
  const measure = (t: number) => {
    let direction = 0;
    let pitchSquares = 0;
    let offPitchSquares = 0;
    let accelerated = false;
    for (const entry of history) {
      if (entry.t > t) continue;
      if (entry.t >= t - accelerationWindowMs && entry.acceleration > minAcceleration) {
        accelerated = true;
      }
      if (entry.t > t - windowMs) {
        direction += entry.yaw;
        pitchSquares += entry.pitch ** 2;
        offPitchSquares += entry.offPitch;
      }
    }
    // Both sums are over the same readings, so the ratio of the sums is the ratio of the RMS values.
    const wobble = pitchSquares === 0 ? 0 : Math.sqrt(offPitchSquares / pitchSquares);
    return { direction, wobble, accelerated };
  };

  const endFlick = () => {
    const flick = current;
    current = null;
    if (flick === null) return;
    if (flick.accelerated) emit(flick);
    else ended = flick;
  };

  const detector: FlickDetector = {
    push(reading) {
      const step = lastT === null ? 0 : Math.min(Math.max(reading.t - lastT, 0), MAX_STEP_MS);
      lastT = reading.t;
      axis = pitchAxis(reading.orientation) ?? axis;
      const rate = reading.rotationRate;
      if (!gripped && current === null && ended === null) return;
      if (rate === null || axis === null) return;

      const pitch = -dot(rate, axis);
      const acceleration = linearAcceleration(reading);
      history.push({
        t: reading.t,
        pitch,
        offPitch: Math.max(dot(rate, rate) - pitch ** 2, 0),
        yaw: headingRate(reading.orientation, rate) * (step / 1000),
        acceleration,
      });
      while ((history[0]?.t ?? reading.t) <= reading.t - historyMs) history.shift();

      if (ended !== null) {
        if (reading.t > ended.peakT + accelerationWindowMs) {
          ended = null;
        } else if (acceleration > minAcceleration) {
          const flick = ended;
          ended = null;
          emit(flick);
        }
      }

      if (current === null) {
        if (!gripped || thrown || pitch < minRate || reading.t - lastEmitT < cooldownMs) return;
        // A new flick replaces one still waiting for its acceleration.
        ended = null;
        current = { peak: 0, peakT: reading.t, ...measure(reading.t) };
      }
      if (pitch > current.peak) {
        Object.assign(current, { peak: pitch, peakT: reading.t }, measure(reading.t));
      } else if (
        acceleration > minAcceleration &&
        reading.t <= current.peakT + accelerationWindowMs
      ) {
        current.accelerated = true;
      }
      if (pitch < minRate) endFlick();
    },

    mark(event) {
      if (event.type === "grip-down") {
        if (gripped) return;
        gripped = true;
        thrown = false;
        history = [];
        return;
      }
      if (event.type !== "grip-up" || !gripped) return;
      gripped = false;
      endFlick();
    },

    reset() {
      gripped = false;
      thrown = false;
      axis = null;
      lastT = null;
      history = [];
      current = null;
      ended = null;
      lastEmitT = Number.NEGATIVE_INFINITY;
    },

    on: output.on,
  };
  return detector;
}

/**
 * The horizontal unit axis to the right of where the phone points, in the motion frame: rotating
 * around it by a positive rate lifts the top edge. `null` when neither the top edge nor the
 * calibration's `y − z` has a heading (both nearly vertical).
 */
function pitchAxis(orientation: Quaternion): Vec3 | null {
  for (const direction of [TOP_EDGE, AWAY]) {
    const pointing = rotate(orientation, direction);
    const horizontal = Math.hypot(pointing.x, pointing.y);
    if (horizontal >= FORWARD_MIN_HORIZONTAL) {
      return vec(pointing.y / horizontal, -pointing.x / horizontal, 0);
    }
  }
  return null;
}

/**
 * How fast the top edge's heading turns, in deg/s, positive to the right: the rate of
 * `atan2(top.x, top.y)` as the phone turns at `rate`. 0 while the top edge points nearly straight up
 * or down, where its heading means nothing.
 */
function headingRate(orientation: Quaternion, rate: Vec3): number {
  const top = rotate(orientation, TOP_EDGE);
  const horizontal = top.x ** 2 + top.y ** 2;
  if (horizontal < FORWARD_MIN_HORIZONTAL ** 2) return 0;
  const change = cross(rate, top);
  return (top.y * change.x - top.x * change.y) / horizontal;
}

/**
 * Linear acceleration magnitude in m/s²: the platform's `acceleration` when it has one, else the
 * gravity-including acceleration minus 9.81 m/s² of up.
 */
function linearAcceleration(reading: PoseReading): number {
  if (reading.acceleration) return length(reading.acceleration);
  const g = reading.gravityAcceleration;
  return g ? length(vec(g.x, g.y, g.z - MOTION_UP_G)) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounded to `1 / factor`, without `-0`. */
function roundTo(value: number, factor: number): number {
  return Math.round(value * factor) / factor + 0;
}
