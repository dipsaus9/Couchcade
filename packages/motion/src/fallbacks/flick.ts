/**
 * The swipe fallback for flick (docs/architecture/motion.md, "Flick (CC-5.6)", "Touch fallback:
 * swipe"). Phones without a gyroscope, and players who chose touch, throw with it. It emits exactly
 * the `Flick` the motion detector emits, so a game can't tell them apart, and the throw carries the
 * drag aim the way a motion throw carries the phone's aim.
 *
 * ```ts
 * const flick = createFlickSwipe();
 * flick.on((event, t) => stream.fire({ type: "throw", payload: { flick: event, aim: drag.aim() } }, t));
 * pad.onpointermove = (e) => flick.push({ t: e.timeStamp, x: e.clientX, y: e.clientY, type: "move" });
 * ```
 */
import {
  createFlickOutput,
  FLICK_COOLDOWN_MS,
  type FlickOutputOptions,
  type FlickSource,
} from "../gestures/flick.ts";
import type { PointerPoint } from "./aim.ts";
import {
  createSwingSwipe,
  SWIPE_FAST_PX_PER_S,
  SWIPE_MIN_PX,
  SWIPE_SLOW_PX_PER_S,
  SWIPE_SPEED_WINDOW_MS,
} from "./swing.ts";

/** The RMS sideways wander over the swipe length is multiplied by this, so a clearly curved swipe is full wobble. */
export const FLICK_SWIPE_WOBBLE_SCALE = 4;
/** How many points along the path, evenly spaced by distance, the sideways wander is sampled at. */
const WOBBLE_SAMPLES = 32;

export interface FlickSwipeOptions extends FlickOutputOptions {
  /** Defaults to `SWIPE_MIN_PX`, the swing swipe's 60 px. */
  minSwipePx?: number;
  /** Defaults to `SWIPE_SLOW_PX_PER_S`, the swing swipe's 300 px/s (power 0). */
  slowPxPerS?: number;
  /** Defaults to `SWIPE_FAST_PX_PER_S`, the swing swipe's 2,400 px/s (power 1). */
  fastPxPerS?: number;
  /** Defaults to `SWIPE_SPEED_WINDOW_MS`. */
  speedWindowMs?: number;
  /** Defaults to `FLICK_SWIPE_WOBBLE_SCALE`. */
  wobbleScale?: number;
  /** A swipe starting less than this after the last throw's `at` is ignored. Defaults to `FLICK_COOLDOWN_MS`. */
  cooldownMs?: number;
}

export type FlickSwipe = FlickSource<PointerPoint>;

/**
 * The swipe pad (motion.md, "Touch fallback: swipe" for flick):
 *
 * - A swipe that ends at least 60 px from where it started, and higher up the pad, throws when the
 *   finger lifts. A `cancel` (the browser took the touch) drops it.
 * - `power` is the swing swipe's `speed`: the peak finger speed over any 50 ms window, from 300 px/s
 *   (0) to 2,400 px/s (1).
 * - `direction` is the angle of the line from the start to the end of the swipe from straight up,
 *   `atan2(dx, −dy)`, positive to the right, clamped to ±30°.
 * - `wobble` is the RMS sideways distance of the path from that line, divided by the line's length,
 *   times 4, clamped to 1.
 * - `at` is the time of the fastest window.
 * - One throw per touch, and the detector's 800 ms cooldown.
 */
export function createFlickSwipe(options: FlickSwipeOptions = {}): FlickSwipe {
  const {
    minSwipePx = SWIPE_MIN_PX,
    slowPxPerS = SWIPE_SLOW_PX_PER_S,
    fastPxPerS = SWIPE_FAST_PX_PER_S,
    speedWindowMs = SWIPE_SPEED_WINDOW_MS,
    wobbleScale = FLICK_SWIPE_WOBBLE_SCALE,
    cooldownMs = FLICK_COOLDOWN_MS,
  } = options;
  const output = createFlickOutput(options);
  // The swing swipe already decides what counts as a swipe up and measures its peak finger speed.
  // Its local times are kept, so `at` goes through this output's room clock once.
  const swipe = createSwingSwipe({
    emitOn: "release",
    minSwipePx,
    slowPxPerS,
    fastPxPerS,
    speedWindowMs,
    toRoomTime: (t) => t,
  });

  /** The current touch's points, while it counts. */
  let points: PointerPoint[] = [];
  let lastThrowT = Number.NEGATIVE_INFINITY;

  swipe.on(({ speed }, t) => {
    const start = points[0];
    const end = points.at(-1);
    if (!start || !end) return;
    const [dx, dy] = [end.x - start.x, end.y - start.y];
    lastThrowT = t;
    output.emit({
      power: speed,
      direction: (Math.atan2(dx, -dy) * 180) / Math.PI,
      wobble: (wander(points) / Math.hypot(dx, dy)) * wobbleScale,
      t,
    });
  });

  return {
    push(point) {
      if (point.type === "down") {
        if (points.length > 0 || point.t - lastThrowT < cooldownMs) return;
        points = [point];
      } else {
        if (points.length === 0) return;
        points.push(point);
      }
      // The swing swipe emits on `up`, while `points` still holds the whole path.
      swipe.push(point);
      if (point.type === "up" || point.type === "cancel") points = [];
    },
    reset() {
      points = [];
      lastThrowT = Number.NEGATIVE_INFINITY;
      swipe.reset();
    },
    on: output.on,
  };
}

/**
 * The RMS sideways distance of the path from the straight line between its first and last points,
 * sampled at points evenly spaced along the path, so a slow stretch with many pointer events
 * doesn't count for more than a fast one.
 */
function wander(points: readonly PointerPoint[]): number {
  const start = points[0] as PointerPoint;
  const end = points.at(-1) as PointerPoint;
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (chord === 0) return 0;
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1] as PointerPoint, points[i] as PointerPoint];
    distances.push((distances[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = distances.at(-1) ?? 0;
  // The chord's direction turned a quarter to the right.
  const normal = { x: -(end.y - start.y) / chord, y: (end.x - start.x) / chord };
  let squares = 0;
  let segment = 1;
  for (let k = 0; k <= WOBBLE_SAMPLES; k++) {
    const distance = (total * k) / WOBBLE_SAMPLES;
    while (segment < points.length - 1 && (distances[segment] ?? 0) < distance) segment++;
    const [a, b] = [points[segment - 1] as PointerPoint, points[segment] as PointerPoint];
    const [da, db] = [distances[segment - 1] ?? 0, distances[segment] ?? 0];
    const f = db > da ? (distance - da) / (db - da) : 0;
    const side =
      (a.x + (b.x - a.x) * f - start.x) * normal.x + (a.y + (b.y - a.y) * f - start.y) * normal.y;
    squares += side ** 2;
  }
  return Math.sqrt(squares / (WOBBLE_SAMPLES + 1));
}
