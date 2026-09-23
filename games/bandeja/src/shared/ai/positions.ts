/**
 * Per-tick player movement (docs/games/bandeja.md rule 3, AC1): every slot - human or CPU - walks
 * toward where the ball in flight will land, and drifts back to its home spot once there's no ball
 * to chase. Called once a tick from `rules.ts`'s `onTick`, for every slot the match uses
 * (`matchSlots`), so `BandejaState.positions` always reflects the ball currently in flight.
 *
 * The landing spot itself comes from `ball.landing`, not a fresh `predictLanding` call here:
 * `rules.ts` caches it on `BallState` at the same path-change events `leg` is recomputed at (a
 * serve, a connected swing, a wall or floor bounce), because the ball's path between those events
 * is a single straight-line-then-gravity segment whose landing spot doesn't change tick to tick.
 * Running the 150-step `predictLanding` simulation fresh for every slot on every 60 Hz tick (as an
 * earlier version of this file did) repriced the game loop far above physics.ts's own "a handful of
 * times per rally" budget for `predict` and was slow enough to blow CI's test timeouts; reading the
 * cached value keeps this function itself down to plain vector arithmetic.
 */
import type { SlotSpec } from "../constants.ts";
import type { BallState } from "../state.ts";
import { clampToReach, stepToward } from "./movement.ts";
import type { Vec2 } from "./movement.ts";

/**
 * How fast a player can cover their own patch of court, in m/s. A doubles slot's reach circle is
 * 4.8 m across; at this speed that's under 1.5 s corner to corner, comfortably inside a rally's
 * ~0.85-1.8 s shot time (docs/games/bandeja.md, "Point flow and timings"), without being a sprint.
 */
export const playerMoveSpeedMs = 3.5;

/** Where a slot should be standing right now: walking toward the ball's cached predicted landing
 * spot (clamped inside its own reach circle) while a ball's live, or home when it isn't. Pure. */
export function nextPosition(
  spec: SlotSpec,
  current: Vec2,
  ball: BallState | null,
  dtMs: number,
): Vec2 {
  const target = targetFor(spec, ball);
  const maxDistance = (playerMoveSpeedMs * dtMs) / 1000;
  return stepToward(current, target, maxDistance);
}

function targetFor(spec: SlotSpec, ball: BallState | null): Vec2 {
  if (ball === null || ball.landing === null) return spec.home;
  return clampToReach([ball.landing.x, ball.landing.y], spec.home, spec.reach);
}
