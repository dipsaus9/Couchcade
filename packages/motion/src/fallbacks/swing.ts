/**
 * Touch fallbacks for swing (docs/architecture/motion.md, "Swing (CC-5.4)"). Phones without a
 * gyroscope, and players who chose touch, swing with one of these. Both emit exactly the `Swing`
 * the motion detector emits, so a game can't tell them apart. The game spec picks one
 * (motion.md conflicts row 5):
 *
 * - `createSwingSwipe`: swipe up the pad. Speed, angle and bend become speed, angle and spin.
 * - `createSwingTap`: tap the left or right half of the pad, for games where timing is everything
 *   (Dinger Derby, Bandeja).
 *
 * ```ts
 * const swing = createSwingSwipe({ emitOn: "release" });
 * swing.on((event, t) => stream.fire({ type: "bowl", payload: event }, t));
 * pad.onpointermove = (e) => swing.push({ t: e.timeStamp, x: e.clientX, y: e.clientY, type: "move" });
 * ```
 */
import {
  createSwingOutput,
  SWING_COOLDOWN_MS,
  type SwingEmitOn,
  type SwingOutputOptions,
  type SwingSource,
} from "../gestures/swing.ts";
import type { PointerPoint } from "./aim.ts";

/** A swipe must travel at least this far up the pad, in CSS px, to be a swing. Shorter ones are taps or slips. */
export const SWIPE_MIN_PX = 60;
/** Peak finger speed that is speed 0, in CSS px/s. A deliberate but lazy flick of the thumb. */
export const SWIPE_SLOW_PX_PER_S = 300;
/** Peak finger speed that is speed 1, in CSS px/s. A fast thumb swipe; faster adds nothing, like a firm swing. */
export const SWIPE_FAST_PX_PER_S = 2400;
/** Finger speed is measured over windows this long, in ms: three pointer events at 60 Hz, so one jumpy event can't fake a peak. */
export const SWIPE_SPEED_WINDOW_MS = 50;
/** The angle is the direction of this last stretch of the swipe, in CSS px, where the thumb lets go of the curve. */
export const SWIPE_ANGLE_TAIL_PX = 80;
/**
 * `emitOn: "peak"`: once past `SWIPE_MIN_PX`, the swipe emits when the finger slows under this share
 * of its peak speed. Half, so the ordinary unevenness of a swipe doesn't end it early.
 */
export const SWIPE_SLOWDOWN_RATIO = 0.5;
/** A tap is a solid but not full swing, so timing decides the hit, not how hard the thumb lands. */
export const TAP_SPEED = 0.7;
/** A tap on the left half of the pad swings at −60°, the right half at 60° (Bandeja's backhand and forehand). */
export const TAP_ANGLE = 60;

export interface SwingSwipeOptions extends SwingOutputOptions {
  /** `"release"` emits when the finger lifts, `"peak"` as soon as the swipe passes 60 px and slows. Defaults to `"peak"`. */
  emitOn?: SwingEmitOn;
  /** Defaults to `SWIPE_MIN_PX`. */
  minSwipePx?: number;
  /** Defaults to `SWIPE_SLOW_PX_PER_S`. */
  slowPxPerS?: number;
  /** Defaults to `SWIPE_FAST_PX_PER_S`. */
  fastPxPerS?: number;
  /** Defaults to `SWIPE_SPEED_WINDOW_MS`. */
  speedWindowMs?: number;
  /** Defaults to `SWIPE_ANGLE_TAIL_PX`. */
  angleTailPx?: number;
  /** Defaults to `SWIPE_SLOWDOWN_RATIO`. */
  slowdownRatio?: number;
  /** `"peak"`: a swipe starting less than this after the last emitted swing is ignored. Defaults to `SWING_COOLDOWN_MS`. */
  cooldownMs?: number;
}

export type SwingSwipe = SwingSource<PointerPoint>;

interface Measured {
  /** Peak finger speed over any window, px/s. */
  peakSpeed: number;
  peakT: number;
  /** Speed over the window ending at the latest point, px/s. */
  latestSpeed: number;
}

/**
 * The swipe pad (motion.md, "Touch fallback: swipe"):
 *
 * - Touching the pad is grip-down, lifting the finger grip-up. A `cancel` (the browser took the
 *   touch) drops the swipe without a swing.
 * - A swipe that ends at least 60 px from where it started, and higher up the pad, is a swing.
 * - `speed` maps the peak finger speed over any 50 ms window from 300 px/s (0) to 2,400 px/s (1).
 * - `angle` is the direction of the last 80 px: `atan2(dx, −dy)`, so straight up is 0 and right
 *   is positive.
 * - `spin` is the path's midpoint's sideways distance from the straight line between start and end,
 *   divided by half that line's length. Bending right is positive.
 * - `peakAt` is the time of the last point of the fastest window.
 * - One swing per touch. `"peak"` also keeps the detector's 400 ms cooldown.
 */
export function createSwingSwipe(options: SwingSwipeOptions = {}): SwingSwipe {
  const {
    emitOn = "peak",
    minSwipePx = SWIPE_MIN_PX,
    slowPxPerS = SWIPE_SLOW_PX_PER_S,
    fastPxPerS = SWIPE_FAST_PX_PER_S,
    speedWindowMs = SWIPE_SPEED_WINDOW_MS,
    angleTailPx = SWIPE_ANGLE_TAIL_PX,
    slowdownRatio = SWIPE_SLOWDOWN_RATIO,
    cooldownMs = SWING_COOLDOWN_MS,
  } = options;
  const output = createSwingOutput(options);

  /** The current touch's points, with the path length up to each one. */
  let points: PointerPoint[] = [];
  let distances: number[] = [];
  let done = false;
  let lastEmitT = Number.NEGATIVE_INFINITY;

  const qualifies = () => {
    const start = points[0];
    const end = points.at(-1);
    if (!start || !end) return false;
    return end.y < start.y && Math.hypot(end.x - start.x, end.y - start.y) >= minSwipePx;
  };

  const measure = (): Measured => {
    const first = points[0] as PointerPoint;
    const last = points.length - 1;
    const speedOver = (from: number, to: number) => {
      const ms = (points[to] as PointerPoint).t - (points[from] as PointerPoint).t;
      return ms > 0 ? (((distances[to] ?? 0) - (distances[from] ?? 0)) / ms) * 1000 : 0;
    };
    // A swipe shorter than one window is measured as a whole.
    const whole = speedOver(0, last);
    let measured: Measured = { peakSpeed: whole, peakT: points[last]?.t ?? 0, latestSpeed: whole };
    let found = false;
    let j = 0;
    for (let i = 1; i <= last; i++) {
      const end = points[i] as PointerPoint;
      if (end.t - first.t < speedWindowMs) continue;
      // The window starts at the latest point at least a window before this one.
      while ((points[j + 1] as PointerPoint).t <= end.t - speedWindowMs) j++;
      const speed = speedOver(j, i);
      if (!found || speed > measured.peakSpeed) {
        measured = { ...measured, peakSpeed: speed, peakT: end.t };
        found = true;
      }
      measured.latestSpeed = speed;
    }
    return measured;
  };

  const emit = (measured: Measured) => {
    done = true;
    const start = points[0] as PointerPoint;
    const end = points.at(-1) as PointerPoint;
    lastEmitT = end.t;
    output.emit({
      speed: (measured.peakSpeed - slowPxPerS) / (fastPxPerS - slowPxPerS),
      angle: tailAngle(),
      spin: bend(start, end),
      t: measured.peakT,
    });
  };

  const tailAngle = () => {
    const end = points.at(-1) as PointerPoint;
    const total = distances.at(-1) ?? 0;
    let k = points.length - 1;
    while (k > 0 && total - (distances[k] ?? 0) < angleTailPx) k--;
    const from = points[k] as PointerPoint;
    const [dx, dy] = [end.x - from.x, end.y - from.y];
    return dx === 0 && dy === 0 ? 0 : (Math.atan2(dx, -dy) * 180) / Math.PI;
  };

  /** Signed sideways distance of the path's midpoint from the chord, over half the chord. */
  const bend = (start: PointerPoint, end: PointerPoint) => {
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    if (chord === 0) return 0;
    const mid = pointAt((distances.at(-1) ?? 0) / 2);
    // The chord's direction turned a quarter to the right on screen, where y grows downwards.
    const right = { x: -(end.y - start.y) / chord, y: (end.x - start.x) / chord };
    const side = (mid.x - start.x) * right.x + (mid.y - start.y) * right.y;
    return side / (chord / 2);
  };

  /** The point `distance` px along the path. */
  const pointAt = (distance: number) => {
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1] as PointerPoint, points[i] as PointerPoint];
      const [da, db] = [distances[i - 1] ?? 0, distances[i] ?? 0];
      if (db >= distance && db > da) {
        const f = (distance - da) / (db - da);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
    return points[0] ?? { x: 0, y: 0 };
  };

  const add = (point: PointerPoint) => {
    const last = points.at(-1);
    const step = last ? Math.hypot(point.x - last.x, point.y - last.y) : 0;
    distances.push((distances.at(-1) ?? 0) + step);
    points.push(point);
  };

  const clear = () => {
    points = [];
    distances = [];
    done = false;
  };

  return {
    push(point) {
      if (point.type === "down") {
        if (points.length > 0) return;
        add(point);
        done = emitOn === "peak" && point.t - lastEmitT < cooldownMs;
        return;
      }
      if (points.length === 0) return;
      if (point.type === "cancel") {
        clear();
        return;
      }
      add(point);
      if (!done && qualifies()) {
        const measured = measure();
        const lifted = point.type === "up";
        const slowed = measured.latestSpeed < measured.peakSpeed * slowdownRatio;
        if (lifted || (emitOn === "peak" && slowed)) emit(measured);
      }
      if (point.type === "up") clear();
    },
    reset() {
      clear();
      lastEmitT = Number.NEGATIVE_INFINITY;
    },
    on: output.on,
  };
}

export interface SwingTapOptions extends SwingOutputOptions {
  /**
   * The pad's left edge and width in the same CSS px as the points' `x`, or a function that reads
   * them at each tap so a resized pad still splits in half.
   */
  pad: PadBounds | (() => PadBounds);
  /** A tap less than this after the last one is ignored, so a double tap is one swing. Defaults to `SWING_COOLDOWN_MS`. */
  cooldownMs?: number;
}

export interface PadBounds {
  left: number;
  width: number;
}

export type SwingTap = SwingSource<PointerPoint>;

/**
 * The tap pad (motion.md, "Touch fallback: tap"): a `down` on the pad emits
 * `{ speed: 0.7, angle: ±60, spin: 0, peakAt }` at once, with `peakAt` the `pointerdown` time.
 * The left half is −60°, the right half 60°. Moves, lifts and taps within the 400 ms cooldown do
 * nothing.
 */
export function createSwingTap(options: SwingTapOptions): SwingTap {
  const { pad, cooldownMs = SWING_COOLDOWN_MS } = options;
  const output = createSwingOutput(options);
  let lastTapT = Number.NEGATIVE_INFINITY;

  return {
    push(point) {
      if (point.type !== "down" || point.t - lastTapT < cooldownMs) return;
      lastTapT = point.t;
      const { left, width } = typeof pad === "function" ? pad() : pad;
      const angle = point.x < left + width / 2 ? -TAP_ANGLE : TAP_ANGLE;
      output.emit({ speed: TAP_SPEED, angle, spin: 0, t: point.t });
    },
    reset() {
      lastTapT = Number.NEGATIVE_INFINITY;
    },
    on: output.on,
  };
}
