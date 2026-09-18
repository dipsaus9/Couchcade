/**
 * The world the rules own (docs/games/strike-night.md, "Ball and pins"): onTick steps this with
 * `@couchcade/physics` during `rolling`. Every function here is pure: a `WorldSpec` is rebuilt
 * from `ActiveRoll` every call, so the falling-pin rule (a pin's spec widens once it's falling)
 * stays derived from state, never cached.
 */
import { circleBody, floorFriction, stepWorld, wallSegment } from "@couchcade/physics";
import type { BodyState, Push, WorldSpec } from "@couchcade/physics";
import {
  aimGain,
  ballDampingHalfLifeMs,
  ballDensity,
  ballFriction,
  ballId,
  ballRadius,
  ballRestitution,
  downDistance,
  fallingPinDensity,
  fallingPinRadius,
  fallingSpeed,
  gutterBeforeY,
  hookForceFactor,
  hookFromY,
  kickbackLeftX,
  kickbackMaxY,
  kickbackMinY,
  kickbackRestitution,
  kickbackRightX,
  laneCenterX,
  laneMaxX,
  laneMinX,
  maxAimAngle,
  minThrowSpeed,
  pinDampingHalfLifeMs,
  pinDensity,
  pinFriction,
  pinRadius,
  pinRestitution,
  pinSpots,
  pitY,
  rollingMaxMs,
  settleAfterPinsMs,
  startXRange,
  startY,
  throwSpeedRange,
} from "./constants.ts";
import type { PinSpot } from "./constants.ts";
import type { ActiveRoll, PinRuntime } from "./state.ts";

/** A ball's mass from its density and radius: `density * PI * radius^2`, 7.0 kg. */
const ballMassKg = ballDensity * Math.PI * ballRadius ** 2;

const ballDamping = floorFriction(ballDampingHalfLifeMs);
const pinDamping = floorFriction(pinDampingHalfLifeMs);

const standingPinSpec = circleBody({
  radius: pinRadius,
  density: pinDensity,
  friction: pinFriction,
  restitution: pinRestitution,
  damping: pinDamping,
});
const fallingPinSpec = circleBody({
  radius: fallingPinRadius,
  density: fallingPinDensity,
  friction: pinFriction,
  restitution: pinRestitution,
  damping: pinDamping,
});
const ballSpec = circleBody({
  radius: ballRadius,
  density: ballDensity,
  friction: ballFriction,
  restitution: ballRestitution,
  damping: ballDamping,
  bullet: true,
});

const kickbacks = [
  wallSegment([kickbackLeftX, kickbackMinY], [kickbackLeftX, kickbackMaxY], {
    id: "kickback-left",
    restitution: kickbackRestitution,
  }),
  wallSegment([kickbackRightX, kickbackMinY], [kickbackRightX, kickbackMaxY], {
    id: "kickback-right",
    restitution: kickbackRestitution,
  }),
];

function buildWorldSpec(pins: readonly PinRuntime[]): WorldSpec {
  const bodies: WorldSpec["bodies"] = { [ballId]: ballSpec };
  for (const pin of pins) {
    if (pin.body === null) continue;
    bodies[pin.id] = pin.fell ? fallingPinSpec : standingPinSpec;
  }
  return { gravity: [0, 0], walls: kickbacks, bodies };
}

/** The hook push on the ball: perpendicular to its velocity, to the right for positive spin. */
function hookPush(vx: number, vy: number, spin: number): Push {
  const speed = Math.hypot(vx, vy);
  if (speed === 0 || spin === 0) return { id: ballId, fx: 0, fy: 0 };
  const k = ballMassKg * hookForceFactor * spin * speed;
  return { id: ballId, fx: k * vy, fy: -k * vx };
}

const spotById = new Map<string, PinSpot>(pinSpots.map((spot) => [spot.id, spot]));

export interface StartRollOptions {
  bowlerId: string;
  frame: number;
  roll: 1 | 2;
  turn: number;
  auto: boolean;
  releaseAtMs: number;
  /** −1 to 1: where the bowler stood. */
  x: number;
  /** 0 to 1. */
  speed: number;
  /** −180 to 180 degrees, clamped to ±30 before `aimGain` scales it. */
  angle: number;
  /** −1 to 1. */
  spin: number;
  /** The pins in play for this roll: all 10 on roll 1, roll 1's survivors on roll 2. */
  standingIds: readonly string[];
}

/** Throws the ball ("Throwing"): the pins in play start fresh at their exact spots. */
export function startRoll(options: StartRollOptions): ActiveRoll {
  const clampedAngle = Math.max(-maxAimAngle, Math.min(maxAimAngle, options.angle));
  const directionRad = ((clampedAngle * aimGain) / 180) * Math.PI;
  const speed = minThrowSpeed + throwSpeedRange * options.speed;
  const ball: BodyState = {
    id: ballId,
    x: laneCenterX + options.x * startXRange,
    y: startY,
    vx: speed * Math.sin(directionRad),
    vy: speed * Math.cos(directionRad),
    a: 0,
    w: 0,
  };
  const pins: PinRuntime[] = options.standingIds.map((id) => {
    const spot = spotById.get(id) as PinSpot;
    return {
      id,
      spotX: spot.x,
      spotY: spot.y,
      body: { id, x: spot.x, y: spot.y, vx: 0, vy: 0, a: 0, w: 0 },
      fell: false,
    };
  });
  return {
    bowlerId: options.bowlerId,
    frame: options.frame,
    roll: options.roll,
    turn: options.turn,
    auto: options.auto,
    spin: options.spin,
    releaseAtMs: options.releaseAtMs,
    ball,
    gutter: false,
    gutterEndAtMs: null,
    reachedPinsAtMs: null,
    pins,
  };
}

/** One fixed 60 Hz physics step ("Gutters, settling and counting"). */
export function stepRoll(roll: ActiveRoll, nowMs: number): ActiveRoll {
  const spec = buildWorldSpec(roll.pins);
  const pushes: Push[] = [];
  if (roll.ball !== null && !roll.gutter && roll.ball.y >= hookFromY) {
    pushes.push(hookPush(roll.ball.vx, roll.ball.vy, roll.spin));
  }
  const bodies: BodyState[] = [];
  if (roll.ball !== null) bodies.push(roll.ball);
  for (const pin of roll.pins) if (pin.body !== null) bodies.push(pin.body);
  if (bodies.length === 0) return roll;

  const result = stepWorld(spec, bodies, pushes);
  const byId = new Map(result.bodies.map((body) => [body.id, body]));

  let ball = roll.ball;
  let gutter = roll.gutter;
  let gutterEndAtMs = roll.gutterEndAtMs;
  let reachedPinsAtMs = roll.reachedPinsAtMs;

  if (ball !== null) {
    const next = byId.get(ballId) ?? null;
    if (next === null) {
      ball = null;
    } else if (!gutter && (next.x < laneMinX || next.x > laneMaxX) && next.y < gutterBeforeY) {
      gutter = true;
      const speed = Math.hypot(next.vx, next.vy);
      gutterEndAtMs = speed > 0 ? nowMs + ((pitY - next.y) / speed) * 1000 : nowMs;
      ball = null; // leaves the world: it can't touch a pin (rule "Gutter")
    } else {
      if (reachedPinsAtMs === null && next.y >= gutterBeforeY) reachedPinsAtMs = nowMs;
      ball = next.y >= pitY ? null : next;
    }
  }

  const pins = roll.pins.map((pin): PinRuntime => {
    if (pin.body === null) return pin;
    const next = byId.get(pin.id);
    if (next === undefined) return { ...pin, body: null, fell: true };
    if (next.y >= pitY) return { ...pin, body: null, fell: true };
    const fell = pin.fell || Math.hypot(next.vx, next.vy) > fallingSpeed;
    return { ...pin, body: next, fell };
  });

  return { ...roll, ball, gutter, gutterEndAtMs, reachedPinsAtMs, pins };
}

/** `rolling` ends at the first of the settling rules, or the gutter's own timing. */
export function isRollSettled(roll: ActiveRoll, nowMs: number): boolean {
  if (nowMs >= roll.releaseAtMs + rollingMaxMs) return true;
  if (roll.gutter) return roll.gutterEndAtMs !== null && nowMs >= roll.gutterEndAtMs;
  if (roll.reachedPinsAtMs !== null && nowMs >= roll.reachedPinsAtMs + settleAfterPinsMs)
    return true;
  const ballSlow = roll.ball === null || Math.hypot(roll.ball.vx, roll.ball.vy) < 0.1;
  if (!ballSlow) return false;
  return roll.pins.every((pin) => pin.body === null || Math.hypot(pin.body.vx, pin.body.vy) < 0.05);
}

/** A pin is down: it fell into the pit, is falling, or sits more than `downDistance` from its spot. */
export function pinIsDown(pin: PinRuntime): boolean {
  if (pin.body === null || pin.fell) return true;
  return Math.hypot(pin.body.x - pin.spotX, pin.body.y - pin.spotY) > downDistance;
}
