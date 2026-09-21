/**
 * Per-tick player movement (docs/games/bandeja.md rule 3, AC1): every slot - human or CPU - walks
 * toward where the ball in flight will land, and drifts back to its home spot once there's no ball
 * to chase. Called once a tick from `rules.ts`'s `onTick`, for every slot the match uses
 * (`matchSlots`), so `BandejaState.positions` always reflects the ball currently in flight.
 */
import { tickMs } from "@couchcade/game-sdk/contract";
import { predictSteps } from "../constants.ts";
import type { SlotSpec } from "../constants.ts";
import type { BallState } from "../state.ts";
import { predictLanding } from "./landing.ts";
import { clampToReach, stepToward } from "./movement.ts";
import type { Vec2 } from "./movement.ts";

/**
 * How fast a player can cover their own patch of court, in m/s. A doubles slot's reach circle is
 * 4.8 m across; at this speed that's under 1.5 s corner to corner, comfortably inside a rally's
 * ~0.85-1.8 s shot time (docs/games/bandeja.md, "Point flow and timings"), without being a sprint.
 */
export const playerMoveSpeedMs = 3.5;

/** Where a slot should be standing right now: walking toward the ball's predicted landing spot
 * (clamped inside its own reach circle) while a ball's live, or home when it isn't. Pure. */
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
  if (ball === null) return spec.home;
  const landing = predictLanding(
    { x: ball.body.x, y: ball.body.y, z: ball.z, vx: ball.body.vx, vy: ball.body.vy, vz: ball.vz },
    tickMs,
    predictSteps,
  );
  if (landing === null) return spec.home;
  return clampToReach([landing.x, landing.y], spec.home, spec.reach);
}
