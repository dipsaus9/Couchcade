/**
 * Landing prediction (docs/games/bandeja.md, "Look-ahead"): where the ball will first touch the
 * floor if nobody hits it. This is a different question from `physics.ts`'s own `predict`, which
 * looks for each slot's *reach-window* arrival around its fixed home spot - the spec is explicit
 * that `predict` "is also what CC-23.8 will use to move players and drive the CPU, which is why it
 * belongs in games/bandeja/src/shared/ from CC-23.2 and not inside CC-23.8's ai/ folder", so this
 * story reuses it rather than changing it. `predictLanding` is what CC-23.8 itself adds: a walking
 * target for `positions.ts` and a depth signal for `cpu.ts`, both pure and both new here.
 */
import { ballId } from "../constants.ts";
import { applyFloorBounceDrag, stepBallPlan, stepHeight } from "../physics.ts";
import type { PredictBall } from "../physics.ts";
import type { BodyState } from "@couchcade/physics";

export interface Landing {
  x: number;
  y: number;
  /** Game time of the bounce, relative to `nowMs` passed by the caller (0-based, like `predict`
   * would be if it were handed `nowMs = 0`; callers add their own `nowMs` if they need absolute
   * time). */
  tMs: number;
}

/**
 * Steps a throwaway copy of the ball forward, at the same fixed step `dtMs` (60 Hz in practice) and
 * over the same horizon as `physics.ts`'s `predict` (`maxSteps`, defaulting to its `predictSteps`),
 * until the first floor bounce. Returns `null` when the ball doesn't land inside the horizon (never
 * happens in practice - the ball always lands well inside 2.5 s - but a v2 tuning change should not
 * be able to throw here). Pure.
 */
export function predictLanding(ball: PredictBall, dtMs: number, maxSteps: number): Landing | null {
  const dtSeconds = dtMs / 1000;
  let body: BodyState = { id: ballId, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, a: 0, w: 0 };
  let z = ball.z;
  let vz = ball.vz;

  for (let step = 0; step < maxSteps; step++) {
    const planStep = stepBallPlan(body, z);
    body = planStep.body;
    const heightStep = stepHeight(z, vz, dtSeconds);
    z = heightStep.z;
    vz = heightStep.vz;
    if (heightStep.bounced) {
      body = applyFloorBounceDrag(body);
      return { x: body.x, y: body.y, tMs: (step + 1) * dtMs };
    }
  }
  return null;
}
