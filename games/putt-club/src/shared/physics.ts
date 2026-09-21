/**
 * The green the rules own (docs/games/putt-club.md, "The green, the ball and the cup", "Aim, then
 * power" and "Rules and scoring" rule 8): `onTick` steps this with `@couchcade/physics` during
 * `rolling`. Every function here is pure: a `WorldSpec` is rebuilt from the hole every call, and
 * the ball is the only body — everyone else's ball is a ghost, never a physics body (owner
 * decision 5).
 */
import { STEP_SECONDS, circleBody, stepWorld, wallLoop, wallPath } from "@couchcade/physics";
import type { BodyState, Push, WorldSpec } from "@couchcade/physics";
import {
  AIM_SPAN_DEG,
  CAPTURE_SPEED,
  LIP_LOSS,
  PATH_MAX_POINTS,
  PUSH_ANGLE_CLAMP_DEG,
  PUSH_GAIN,
  PUTT_MIN_SPEED,
  PUTT_SPEED_RANGE,
  RESET_BACKOFF,
  RESET_CLEARANCE,
  RESET_STEP,
  ROLL_DECEL,
  STOP_SPEED,
  autoPuttShortFraction,
  ballDensity,
  ballFriction,
  ballId,
  ballMassKg,
  ballRadius,
  ballRestitution,
  kerbFriction,
  kerbRestitutionDefault,
  rollingMaxMs,
} from "./constants.ts";
import { closestApproachSq, distance, segmentEntersBox, segmentEntersCircle } from "./geometry.ts";
import { clearanceAt, inPlay } from "./hole.ts";
import type { Hole, HoleHazard, Spot } from "./hole.ts";
import type { ActiveStroke } from "./state.ts";

const ballSpec = circleBody({
  radius: ballRadius,
  density: ballDensity,
  friction: ballFriction,
  restitution: ballRestitution,
  damping: 0,
  bullet: true,
});

/** The world a hole's walls make, rebuilt fresh every step (no cache: a hole is a plain constant). */
function buildWorldSpec(hole: Hole): WorldSpec {
  const walls = hole.walls.map((wall) => {
    const points = wall.points.map(([x, y]): [number, number] => [x, y]);
    const options = {
      friction: kerbFriction,
      restitution: wall.restitution ?? kerbRestitutionDefault,
    };
    return wall.loop ? wallLoop(points, options) : wallPath(points, options);
  });
  return { gravity: [0, 0], walls, bodies: { [ballId]: ballSpec } };
}

/** `atan2(cup - ball)` in degrees: `yaw = 0` always means straight at the flag. */
export function bearingDeg(from: Spot, to: Spot): number {
  return (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The line a stroke is putted along, in degrees (docs/games/putt-club.md, "Aim, then power" and
 * "Input message schema"): `bearing(ball -> cup) + yaw * AIM_SPAN_DEG + clamp(angle, ±45) * PUSH_GAIN`.
 */
export function strokeLineDeg(ball: Spot, cup: Spot, yaw: number, angleDeg: number): number {
  const push = clamp(angleDeg, -PUSH_ANGLE_CLAMP_DEG, PUSH_ANGLE_CLAMP_DEG) * PUSH_GAIN;
  return bearingDeg(ball, cup) + yaw * AIM_SPAN_DEG + push;
}

/** Launch speed from the swing's `speed`, 0 to 1: `PUTT_MIN_SPEED` to `PUTT_MIN_SPEED + PUTT_SPEED_RANGE`. */
export function launchSpeed(speed: number): number {
  return PUTT_MIN_SPEED + PUTT_SPEED_RANGE * speed;
}

/**
 * The auto-putt's `speed` (rule 5): straight at the cup, weighted to stop `autoPuttShortFraction`
 * short of it. `v^2 = 2 * ROLL_DECEL * distance` inverted for the roll distance, then the launch
 * speed formula inverted for `speed`, clamped to 0 to 1 (a very close cup needs less than the
 * softest deliberate putt).
 */
export function autoPuttSpeedParam(distanceToCup: number): number {
  const rollDistance = distanceToCup * (1 - autoPuttShortFraction);
  const v = Math.sqrt(Math.max(0, 2 * ROLL_DECEL * rollDistance));
  return clamp((v - PUTT_MIN_SPEED) / PUTT_SPEED_RANGE, 0, 1);
}

export interface StartStrokeOptions {
  playerId: string;
  hole: number;
  strokeNumber: number;
  turn: number;
  auto: boolean;
  atMs: number;
  ball: Spot;
  cup: Spot;
  /** −1 to 1. */
  yaw: number;
  /** 0 to 1. */
  speed: number;
  /** −180 to 180 degrees, clamped to ±45 before `PUSH_GAIN` scales it. */
  angle: number;
}

/** Strikes the ball ("Aim, then power", "Input message schema"). */
export function startStroke(options: StartStrokeOptions): ActiveStroke {
  const lineDeg = strokeLineDeg(options.ball, options.cup, options.yaw, options.angle);
  const speed = launchSpeed(options.speed);
  const rad = (lineDeg * Math.PI) / 180;
  const ball: BodyState = {
    id: ballId,
    x: options.ball[0],
    y: options.ball[1],
    vx: speed * Math.cos(rad),
    vy: speed * Math.sin(rad),
    a: 0,
    w: 0,
  };
  return {
    playerId: options.playerId,
    hole: options.hole,
    strokeNumber: options.strokeNumber,
    turn: options.turn,
    auto: options.auto,
    strikeAtMs: options.atMs,
    ball,
    path: [options.ball],
    overCup: false,
    outcome: null,
  };
}

/** The per-step rolling-friction push: a constant deceleration, never a reversal ("The world"). */
function frictionPush(ball: BodyState, speed: number): Push {
  if (speed <= 0) return { id: ballId, fx: 0, fy: 0 };
  const decelDeltaV = ROLL_DECEL * STEP_SECONDS;
  if (decelDeltaV >= speed) {
    // This step's constant deceleration would stop or reverse it: apply exactly the impulse that
    // zeroes it, so the ball comes to a dead stop instead of drifting the other way.
    return {
      id: ballId,
      fx: (-ballMassKg * ball.vx) / STEP_SECONDS,
      fy: (-ballMassKg * ball.vy) / STEP_SECONDS,
    };
  }
  return {
    id: ballId,
    fx: (-ballMassKg * ROLL_DECEL * ball.vx) / speed,
    fy: (-ballMassKg * ROLL_DECEL * ball.vy) / speed,
  };
}

/** Whether the segment `p0` -> `p1` crosses into `hazard`. */
function hazardSegmentHit(hazard: HoleHazard, p0: Spot, p1: Spot): boolean {
  return "box" in hazard.shape
    ? segmentEntersBox(p0, p1, hazard.shape.box[0], hazard.shape.box[1])
    : segmentEntersCircle(p0, p1, hazard.shape.circle, hazard.shape.radius);
}

/**
 * One fixed 60 Hz physics step ("The world", "Holing out, and lipping out", "Hazards and out of
 * bounds"). Once `stroke.outcome` is set, the roll is over: this is a no-op from then on, so a
 * caller may keep calling it without checking first.
 */
export function stepStroke(stroke: ActiveStroke, hole: Hole): ActiveStroke {
  if (stroke.outcome !== null) return stroke;

  const p0: Spot = [stroke.ball.x, stroke.ball.y];
  const speedBefore = Math.hypot(stroke.ball.vx, stroke.ball.vy);
  const push = frictionPush(stroke.ball, speedBefore);
  const result = stepWorld(buildWorldSpec(hole), [stroke.ball], [push]);
  let ball = result.bodies[0] as BodyState;
  if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) ball = { ...ball, vx: 0, vy: 0 };
  const p1: Spot = [ball.x, ball.y];

  // Hazards and out of bounds (rule 8): tested on the whole segment, so a fast ball can't tunnel
  // through a hazard in one step. A ball whose centre leaves `bounds` is out of bounds.
  const inHazard = hole.hazards.some((hazard) => hazardSegmentHit(hazard, p0, p1));
  const outOfBounds = !(
    p1[0] >= hole.bounds[0][0] &&
    p1[0] <= hole.bounds[1][0] &&
    p1[1] >= hole.bounds[0][1] &&
    p1[1] <= hole.bounds[1][1]
  );
  if (inHazard || outOfBounds) {
    return { ...stroke, ball, overCup: false, outcome: "offPlay" };
  }

  // Holing out and lipping out: the segment's closest approach to the cup, tested with a squared
  // distance so replays stay exact ("no square roots").
  const withinRadius =
    closestApproachSq(p0, p1, hole.cup) <= hole.captureRadius * hole.captureRadius;
  let outcome: ActiveStroke["outcome"] = null;
  if (withinRadius && !stroke.overCup) {
    const speedAfter = Math.hypot(ball.vx, ball.vy);
    if (speedAfter <= CAPTURE_SPEED) {
      outcome = "holed";
    } else {
      ball = { ...ball, vx: ball.vx * (1 - LIP_LOSS), vy: ball.vy * (1 - LIP_LOSS) };
    }
  }

  const path = outcome === "holed" ? stroke.path : [...stroke.path, p1].slice(-PATH_MAX_POINTS);
  return { ...stroke, ball, path, overCup: withinRadius, outcome };
}

/** `rolling` ends once the ball stops, holes out, leaves play, or `rollingMaxMs` backstops it. */
export function isStrokeSettled(stroke: ActiveStroke, nowMs: number): boolean {
  if (stroke.outcome !== null) return true;
  if (nowMs >= stroke.strikeAtMs + rollingMaxMs) return true;
  return Math.hypot(stroke.ball.vx, stroke.ball.vy) < STOP_SPEED;
}

/** The point `backoffM` back along `path` (newest first), or null if the path is shorter. */
function pointAtBackoff(path: readonly Spot[], backoffM: number): Spot | null {
  if (path.length === 0) return null;
  let remaining = backoffM;
  for (let i = path.length - 1; i > 0; i--) {
    const b = path[i] as Spot;
    const a = path[i - 1] as Spot;
    const segLen = distance(a, b);
    if (segLen >= remaining) {
      const f = segLen === 0 ? 0 : remaining / segLen;
      return [b[0] + (a[0] - b[0]) * f, b[1] + (a[1] - b[1]) * f];
    }
    remaining -= segLen;
  }
  return null;
}

function clearsPlay(hole: Hole, spot: Spot): boolean {
  return inPlay(hole, spot) && clearanceAt(hole, spot) >= RESET_CLEARANCE;
}

/**
 * Where a stroke's ball goes back to after a penalty (rule 8, owner decision 3): the point on its
 * own path `RESET_BACKOFF` before it left play, walked further back in `RESET_STEP` increments
 * until it clears every wall and hazard, falling back to where the ball stood at the start of the
 * stroke, then to the tee.
 */
export function resetSpot(path: readonly Spot[], hole: Hole, strokeStartBall: Spot): Spot {
  for (let backoff = RESET_BACKOFF; ; backoff += RESET_STEP) {
    const candidate = pointAtBackoff(path, backoff);
    if (candidate === null) break;
    if (clearsPlay(hole, candidate)) return candidate;
  }
  if (clearsPlay(hole, strokeStartBall)) return strokeStartBall;
  return hole.tee;
}
