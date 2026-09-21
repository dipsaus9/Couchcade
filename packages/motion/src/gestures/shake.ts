/**
 * Shake (docs/architecture/motion.md, "Shake (CC-5.8)"): one dash event for Bumper Sumo.
 *
 * - `createShakeDetector` reads the controller's one pose tracker and emits one `Shake` per shake.
 *   Unlike swing and flick it needs no grip: it just watches the linear acceleration magnitude, so
 *   it works on accelerometer-only phones too (motion.md, "Pose tracker", rule 4: "shake uses the
 *   raw magnitude").
 * - `fallbacks/shake.ts` has the dash button that emits the same `Shake` on touch.
 *
 * ```ts
 * const tracker = createPoseTracker(calibration);        // one per controller
 * const shake = createShakeDetector();
 * shake.on((event, t) => stream.fire({ type: "dash", payload: event }, t));
 * adapter.start((sample) => shake.push(tracker.push(sample)));
 * ```
 */
import { toHostTime } from "@couchcade/game-sdk/clock";
import { dot, length, vec } from "../calibration/vector.ts";
import type { PoseReading } from "../calibration/pose.ts";
import type { Vec3 } from "../sensors/types.ts";

/** A shake peak must exceed this magnitude, in m/s² (motion.md, "Shake", detection rule 2). */
export const SHAKE_PEAK_THRESHOLD = 14;
/** The second peak must land within this long of the first, in ms. */
export const SHAKE_PEAK_WINDOW_MS = 400;
/**
 * **Hysteresis.** After emitting, the detector re-arms only once the magnitude has stayed under
 * this, in m/s², for `SHAKE_REARM_QUIET_MS`. A long shake is one dash.
 */
export const SHAKE_REARM_THRESHOLD = 4;
/** How long the magnitude must stay under `SHAKE_REARM_THRESHOLD` to re-arm, in ms. */
export const SHAKE_REARM_QUIET_MS = 300;
/** At least this long between emitted events, in ms. The game has its own dash cooldown on top. */
export const SHAKE_COOLDOWN_MS = 700;

/** One dash as games put it in their input payloads. */
export interface Shake {
  /** When the shake landed (the second peak), in room time, whole ms. */
  at: number;
}

/**
 * Receives each shake and the local time of its second peak, in the same time base as the samples
 * and pointer events. Pass that as the input stream's `eventTimeStamp`, so the input's `at` is
 * when the player acted.
 */
export type ShakeListener = (shake: Shake, t: number) => void;

/** What the motion detector and the button fallback share. A game can't tell them apart. */
export interface ShakeSource<TInput> {
  /** Feeds one input: a pose reading for the detector, a button press for the fallback. */
  push(input: TInput): void;
  /** Forgets any peak in progress, the re-arm wait and the cooldown. Listeners stay. */
  reset(): void;
  /** Called with every shake. Returns a function that removes the listener. */
  on(listener: ShakeListener): () => void;
}

export type ShakeDetector = ShakeSource<PoseReading>;

export interface ShakeOutputOptions {
  /**
   * Local sample or event time (`event.timeStamp`) to room time. Defaults to the shared room clock:
   * `toHostTime(performance.timeOrigin + t)`, as the send helper stamps `at`.
   */
  toRoomTime?: (t: number) => number;
}

export interface ShakeDetectorOptions extends ShakeOutputOptions {
  /** Defaults to `SHAKE_PEAK_THRESHOLD`. */
  peakThreshold?: number;
  /** Defaults to `SHAKE_PEAK_WINDOW_MS`. */
  peakWindowMs?: number;
  /** Defaults to `SHAKE_REARM_THRESHOLD`. */
  rearmThreshold?: number;
  /** Defaults to `SHAKE_REARM_QUIET_MS`. */
  rearmQuietMs?: number;
  /** Defaults to `SHAKE_COOLDOWN_MS`. */
  cooldownMs?: number;
}

/** Rounds and converts the peak to room time and calls the listeners. Shared with the fallback. */
export interface ShakeOutput {
  emit(t: number): void;
  on(listener: ShakeListener): () => void;
}

interface PerformanceGlobals {
  performance: { timeOrigin: number };
}

const localToRoomTime = (t: number): number =>
  toHostTime((globalThis as unknown as PerformanceGlobals).performance.timeOrigin + t);

export function createShakeOutput(options: ShakeOutputOptions = {}): ShakeOutput {
  const { toRoomTime = localToRoomTime } = options;
  const listeners = new Set<ShakeListener>();
  return {
    emit(t) {
      const shake: Shake = { at: Math.round(toRoomTime(t)) + 0 };
      for (const listener of listeners) listener({ ...shake }, t);
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The highest magnitude reached so far in the peak run above `peakThreshold`, and where. */
interface Peak {
  vector: Vec3;
  magnitude: number;
  t: number;
}

const MOTION_UP_G = 9.81;

/**
 * Shakes from the pose tracker (motion.md, "Shake", detection rules 1 to 5):
 *
 * 1. Magnitude is the length of linear acceleration: the platform's `acceleration` when it has
 *    one, else `gravityAcceleration` minus 9.81 m/s² of up in the pose's current frame -- the
 *    pose tracker's own gravity correction already stands in for "the filtered gravity vector" on
 *    accelerometer-only phones (motion.md, "Pose tracker", rule 2), so no separate filter is
 *    needed here.
 * 2. A shake is two peaks over 14 m/s² within 400 ms, pointing in roughly opposite directions
 *    (their dot product is negative). Each peak is the highest magnitude reached in one
 *    continuous run above the threshold. `at` is the second peak.
 * 3. Hysteresis: after emitting, no new peak run is considered until the magnitude has stayed
 *    under 4 m/s² for 300 ms straight.
 * 4. At least 700 ms between emitted events.
 * 5. Never reads `rotationRate`, so it works on accelerometer-only phones.
 */
export function createShakeDetector(options: ShakeDetectorOptions = {}): ShakeDetector {
  const {
    peakThreshold = SHAKE_PEAK_THRESHOLD,
    peakWindowMs = SHAKE_PEAK_WINDOW_MS,
    rearmThreshold = SHAKE_REARM_THRESHOLD,
    rearmQuietMs = SHAKE_REARM_QUIET_MS,
    cooldownMs = SHAKE_COOLDOWN_MS,
  } = options;
  const output = createShakeOutput(options);

  let armed = true;
  let quietSince: number | null = null;
  /** The active run above `peakThreshold`, tracking its highest sample so far. */
  let current: Peak | null = null;
  /** The last finalized peak, waiting to pair with a second one within `peakWindowMs`. */
  let lastPeak: Peak | null = null;
  let lastEmitT = Number.NEGATIVE_INFINITY;

  const registerPeak = (peak: Peak) => {
    if (
      lastPeak !== null &&
      peak.t - lastPeak.t <= peakWindowMs &&
      dot(peak.vector, lastPeak.vector) < 0 &&
      peak.t - lastEmitT >= cooldownMs
    ) {
      lastEmitT = peak.t;
      armed = false;
      quietSince = null;
      lastPeak = null;
      output.emit(peak.t);
      return;
    }
    lastPeak = peak;
  };

  return {
    push(reading) {
      const vector = linearAcceleration(reading);
      if (vector === null) return;
      const magnitude = length(vector);

      if (magnitude < rearmThreshold) {
        quietSince ??= reading.t;
        if (!armed && reading.t - quietSince >= rearmQuietMs) armed = true;
      } else {
        quietSince = null;
      }

      if (!armed) {
        current = null;
        return;
      }

      if (current === null) {
        if (magnitude < peakThreshold) return;
        current = { vector, magnitude, t: reading.t };
      } else if (magnitude > current.magnitude) {
        current = { vector, magnitude, t: reading.t };
      }
      if (magnitude < peakThreshold) {
        const peak = current;
        current = null;
        registerPeak(peak);
      }
    },

    reset() {
      armed = true;
      quietSince = null;
      current = null;
      lastPeak = null;
      lastEmitT = Number.NEGATIVE_INFINITY;
    },

    on: output.on,
  };
}

/**
 * Linear acceleration in the motion frame of the current pose: the platform's `acceleration` when
 * it has one, else the gravity-including acceleration minus 9.81 m/s² of up. `null` when neither
 * is present. Shared pattern with swing, flick and tilt's own `linearAcceleration` helpers.
 */
function linearAcceleration(reading: PoseReading): Vec3 | null {
  if (reading.acceleration) return reading.acceleration;
  const g = reading.gravityAcceleration;
  return g ? vec(g.x, g.y, g.z - MOTION_UP_G) : null;
}
