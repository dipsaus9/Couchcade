/**
 * Vector helpers for moving a slot's on-court position (docs/games/bandeja.md rule 3: "Movement
 * and a real CPU partner are CC-23.8's job"; "CC-23.2 builds the rules on fixed spots, CC-23.8
 * lifts them off those spots"). `applySwing` in `rules.ts` and `predict` in `physics.ts` both still
 * judge a hit against the slot's *fixed* home spot and reach circle - that pass/fail math is
 * CC-23.2's, frozen and merged, and this story does not change it. Movement here is a layer on top:
 * a walking position that never promises a reach the hit test doesn't back up, because it is always
 * clamped inside the same reach circle the rules already use.
 */

export type Vec2 = readonly [x: number, y: number];

/** Moves `current` toward `target` by at most `maxDistance`, landing exactly on `target` if it's
 * closer than that. Pure. */
export function stepToward(current: Vec2, target: Vec2, maxDistance: number): Vec2 {
  const dx = target[0] - current[0];
  const dy = target[1] - current[1];
  const distance = Math.hypot(dx, dy);
  if (distance <= maxDistance || distance === 0) return target;
  const t = maxDistance / distance;
  return [current[0] + dx * t, current[1] + dy * t];
}

/** `point`, pulled back to within `reach` metres of `home` if it isn't already. Pure. */
export function clampToReach(point: Vec2, home: Vec2, reach: number): Vec2 {
  const dx = point[0] - home[0];
  const dy = point[1] - home[1];
  const distance = Math.hypot(dx, dy);
  if (distance <= reach || distance === 0) return point;
  const t = reach / distance;
  return [home[0] + dx * t, home[1] + dy * t];
}
