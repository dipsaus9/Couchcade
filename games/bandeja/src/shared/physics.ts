/**
 * The court the rules own (docs/games/bandeja.md, "Court, ball and walls" and "Look-ahead"). Every
 * function here is pure: the world spec (including whether the net is a wall this step) is rebuilt
 * from state every call, the way Strike Night rebuilds a falling pin's spec.
 */
import { circleBody, floorFriction, stepWorld, wallSegment } from "@couchcade/physics";
import type { BodyState, WallSpec, WorldSpec } from "@couchcade/physics";
import {
  backGlassRestitution,
  ballDampingHalfLifeMs,
  ballDensity,
  ballFriction,
  ballId,
  ballRadius,
  ballRestitution,
  cornerGlassMaxY,
  cornerGlassMinY,
  cornerGlassRestitution,
  courtMaxX,
  courtMaxY,
  courtMinX,
  courtMinY,
  floorBouncePlanSpeedFactor,
  floorBounceRestitution,
  gravityMs2,
  netHeight,
  netRestitution,
  netWallId,
  netY,
  predictSteps,
  reachMaxZ,
  sideMeshRestitution,
} from "./constants.ts";
import type { SlotName, SlotSpec } from "./constants.ts";
import type { BallLeg } from "./state.ts";

const ballSpec = circleBody({
  radius: ballRadius,
  density: ballDensity,
  friction: ballFriction,
  restitution: ballRestitution,
  damping: floorFriction(ballDampingHalfLifeMs),
  bullet: true,
});

/** Both back glass walls: "Glass panels are usually used for the back walls...". */
const backGlassWalls: readonly WallSpec[] = [
  wallSegment([courtMinX, courtMinY], [courtMaxX, courtMinY], {
    id: "back-glass-a",
    restitution: backGlassRestitution,
  }),
  wallSegment([courtMinX, courtMaxY], [courtMaxX, courtMaxY], {
    id: "back-glass-b",
    restitution: backGlassRestitution,
  }),
];

/** Corner glass (`y` 0-4 and 16-20) and side mesh (`y` 4-16) on both side walls. */
const sideWalls: readonly WallSpec[] = [
  wallSegment([courtMinX, courtMinY], [courtMinX, cornerGlassMaxY], {
    id: "corner-glass-a-left",
    restitution: cornerGlassRestitution,
  }),
  wallSegment([courtMinX, cornerGlassMaxY], [courtMinX, cornerGlassMinY], {
    id: "side-mesh-left",
    restitution: sideMeshRestitution,
  }),
  wallSegment([courtMinX, cornerGlassMinY], [courtMinX, courtMaxY], {
    id: "corner-glass-b-left",
    restitution: cornerGlassRestitution,
  }),
  wallSegment([courtMaxX, courtMinY], [courtMaxX, cornerGlassMaxY], {
    id: "corner-glass-a-right",
    restitution: cornerGlassRestitution,
  }),
  wallSegment([courtMaxX, cornerGlassMaxY], [courtMaxX, cornerGlassMinY], {
    id: "side-mesh-right",
    restitution: sideMeshRestitution,
  }),
  wallSegment([courtMaxX, cornerGlassMinY], [courtMaxX, courtMaxY], {
    id: "corner-glass-b-right",
    restitution: cornerGlassRestitution,
  }),
];

const courtWalls: readonly WallSpec[] = [...backGlassWalls, ...sideWalls];

const netWall: WallSpec = wallSegment([courtMinX, netY], [courtMaxX, netY], {
  id: netWallId,
  restitution: netRestitution,
});

/** The net is a wall only while the ball is low enough to hit it ("Court, ball and walls"). */
export function netPresent(z: number, x: number): boolean {
  return z < netHeight(x) + ballRadius;
}

function buildWorldSpec(includeNet: boolean): WorldSpec {
  return {
    gravity: [0, 0],
    walls: includeNet ? [...courtWalls, netWall] : [...courtWalls],
    bodies: { [ballId]: ballSpec },
  };
}

export interface PlanStep {
  body: BodyState;
  /** True when this step's contacts touched the net wall (a net fault). */
  netContact: boolean;
  /** True when this step's contacts touched a court wall (glass or mesh, never the net). */
  wallContact: boolean;
}

/**
 * One fixed 60 Hz step of the ball's plan-view motion. `precedingZ` is the ball's height going
 * into this step: whether the net is a wall for this step is decided from it, before the step
 * moves the ball at all.
 */
export function stepBallPlan(body: BodyState, precedingZ: number): PlanStep {
  const includeNet = netPresent(precedingZ, body.x);
  const spec = buildWorldSpec(includeNet);
  const result = stepWorld(spec, [body], []);
  const next = result.bodies[0] as BodyState;
  let netContact = false;
  let wallContact = false;
  for (const [a, b] of result.contacts) {
    if (a !== ballId && b !== ballId) continue;
    const otherId = a === ballId ? b : a;
    if (otherId === netWallId) netContact = true;
    else wallContact = true;
  }
  return { body: next, netContact, wallContact };
}

export interface HeightStep {
  z: number;
  vz: number;
  bounced: boolean;
}

/** One fixed 60 Hz step of the ball's height ("Height"). */
export function stepHeight(z: number, vz: number, dtSeconds: number): HeightStep {
  const nextVzFalling = vz - gravityMs2 * dtSeconds;
  const nextZFalling = z + nextVzFalling * dtSeconds;
  if (nextZFalling < 0) {
    return { z: 0, vz: -nextVzFalling * floorBounceRestitution, bounced: true };
  }
  return { z: nextZFalling, vz: nextVzFalling, bounced: false };
}

/** Scales plan speed by `floorBouncePlanSpeedFactor` after a floor bounce ("turf grabs"). */
export function applyFloorBounceDrag(body: BodyState): BodyState {
  return {
    ...body,
    vx: body.vx * floorBouncePlanSpeedFactor,
    vy: body.vy * floorBouncePlanSpeedFactor,
  };
}

export interface PredictBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface ReachSpan {
  entered: boolean;
  exited: boolean;
  bestDistance: number;
  bestTimeMs: number;
}

/**
 * Steps a throwaway copy of the ball forward up to `predictSteps` ticks, recording each of
 * `slots`' arrival moment ("Look-ahead"): the moment inside the first window where the ball is
 * within that slot's reach and `z` in `[0, reachMaxZ]` that its plan distance to the slot's home
 * is smallest. Pure, and costs `predictSteps` steps of one body regardless of what it finds.
 * `nowMs` is the game time the prediction starts from, so `arrivals` holds absolute game time, not
 * an offset. `slots` is the match's own slot set (`matchSlots`, mapped through `slotSpec`) — a
 * slot nobody's match uses (the other format's home spots) never gets an arrival, so it can never
 * be mistaken for an empty, auto-returning one (rule 10).
 */
export function predict(
  ball: PredictBall,
  dtMs: number,
  nowMs: number,
  slots: readonly SlotSpec[],
): BallLeg {
  const dtSeconds = dtMs / 1000;
  let body: BodyState = { id: ballId, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, a: 0, w: 0 };
  let z = ball.z;
  let vz = ball.vz;

  const spans = new Map<SlotName, ReachSpan>(
    slots.map((spec) => [
      spec.slot,
      { entered: false, exited: false, bestDistance: Number.POSITIVE_INFINITY, bestTimeMs: 0 },
    ]),
  );

  for (let step = 0; step < predictSteps; step++) {
    const planStep = stepBallPlan(body, z);
    body = planStep.body;
    const heightStep = stepHeight(z, vz, dtSeconds);
    z = heightStep.z;
    vz = heightStep.vz;
    if (heightStep.bounced) body = applyFloorBounceDrag(body);
    const tMs = nowMs + (step + 1) * dtMs;

    let anyOpen = false;
    for (const spec of slots) {
      const span = spans.get(spec.slot) as ReachSpan;
      if (span.exited) continue;
      const distance = Math.hypot(body.x - spec.home[0], body.y - spec.home[1]);
      const inSpan = distance <= spec.reach && z >= 0 && z <= reachMaxZ;
      if (inSpan) {
        span.entered = true;
        if (distance < span.bestDistance) {
          span.bestDistance = distance;
          span.bestTimeMs = tMs;
        }
      } else if (span.entered) {
        span.exited = true;
      }
      if (!span.exited) anyOpen = true;
    }
    // Every slot's first window has already opened and closed: nothing later in the flight can
    // change any arrival, so the rest of the (potentially long) bounce path costs nothing further.
    if (!anyOpen) break;
  }

  const arrivals: Partial<Record<SlotName, number>> = {};
  for (const [slot, span] of spans) {
    if (span.entered) arrivals[slot] = span.bestTimeMs;
  }
  return { arrivals, timedOut: [] };
}
