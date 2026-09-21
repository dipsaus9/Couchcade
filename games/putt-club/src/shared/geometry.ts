/**
 * Plain 2D geometry over `Spot` tuples, shared by `hole.ts` (`validateHole`'s clearance checks)
 * and `physics.ts` (the cup and hazard tests, and rule 8's reset walk-back). No imports: every
 * function here is a pure number in, number out, so it's as safe for the phone as it is for the
 * host, even though nothing under `src/controller/` needs it today.
 */
import type { Spot } from "./hole.ts";

/** Straight-line distance between two points. */
export function distance(a: Spot, b: Spot): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Squared distance from the closest point of segment `p0` -> `p1` to `target`, with no square
 * root (docs/games/putt-club.md, "Holing out, and lipping out": "comparing squared distances so
 * there are no square roots and replays are exact").
 */
export function closestApproachSq(p0: Spot, p1: Spot, target: Spot): number {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((target[0] - p0[0]) * dx + (target[1] - p0[1]) * dy) / lenSq));
  const cx = p0[0] + t * dx;
  const cy = p0[1] + t * dy;
  const ex = target[0] - cx;
  const ey = target[1] - cy;
  return ex * ex + ey * ey;
}

/** Distance from `p` to the closest point of segment `a` -> `b`. */
export function pointToSegmentDistance(p: Spot, a: Spot, b: Spot): number {
  return Math.sqrt(closestApproachSq(a, b, p));
}

/** Distance from `p` to the closest edge of an open path or closed loop of `points`. */
export function pointToPolylineDistance(points: readonly Spot[], loop: boolean, p: Spot): number {
  const edges = loop ? points.length : points.length - 1;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < edges; i++) {
    const a = points[i] as Spot;
    const b = points[(i + 1) % points.length] as Spot;
    min = Math.min(min, pointToSegmentDistance(p, a, b));
  }
  return min;
}

/** True when `p` sits inside (or on) the axis-aligned box `min` to `max`. */
export function pointInBox(p: Spot, min: Spot, max: Spot): boolean {
  return p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1];
}

/** True when `p` sits inside (or on) a circle. */
export function pointInCircle(p: Spot, center: Spot, radius: number): boolean {
  const dx = p[0] - center[0];
  const dy = p[1] - center[1];
  return dx * dx + dy * dy <= radius * radius;
}

/** Distance from `p` to the boundary of the axis-aligned box `min` to `max` (0 when inside). */
export function pointToBoxEdgeDistance(p: Spot, min: Spot, max: Spot): number {
  const dx = Math.max(min[0] - p[0], 0, p[0] - max[0]);
  const dy = Math.max(min[1] - p[1], 0, p[1] - max[1]);
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  // p is inside (or on) the box: the distance to the nearest wall.
  return Math.min(p[0] - min[0], max[0] - p[0], p[1] - min[1], max[1] - p[1]);
}

/**
 * Whether the segment `p0` -> `p1` crosses into the axis-aligned box `min` to `max` (the
 * Liang-Barsky clip test): docs/games/putt-club.md, "Hazards and out of bounds" tests the whole
 * segment a ball travelled in one step, not just its end point, so a fast ball can't tunnel
 * through a small hazard.
 */
export function segmentEntersBox(p0: Spot, p1: Spot, min: Spot, max: Spot): boolean {
  let tMin = 0;
  let tMax = 1;
  const d: Spot = [p1[0] - p0[0], p1[1] - p0[1]];
  for (let axis = 0 as 0 | 1; axis < 2; axis++) {
    const origin = p0[axis];
    const dir = d[axis];
    const lo = min[axis];
    const hi = max[axis];
    if (dir === 0) {
      if (origin < lo || origin > hi) return false;
      continue;
    }
    let t1 = (lo - origin) / dir;
    let t2 = (hi - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** Whether the segment `p0` -> `p1` crosses into a circle (the closest-approach test). */
export function segmentEntersCircle(p0: Spot, p1: Spot, center: Spot, radius: number): boolean {
  return closestApproachSq(p0, p1, center) <= radius * radius;
}
