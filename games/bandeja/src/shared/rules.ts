/**
 * Bandeja's rules (docs/games/bandeja.md): pure functions over `BandejaState`. `onTick` drives the
 * ball with `@couchcade/physics` during `serve` and `rally` (the physics is identical in both: the
 * ball launches the instant a serve is computed, and `serve` is a fixed 900 ms label in front of
 * `rally`, matching the mermaid's "the serve leaves the racket"). `onPlayerInput` only ever changes
 * state for the swinger's own slot.
 */
import { createRng } from "@couchcade/utils";
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import { tickMs } from "@couchcade/game-sdk/contract";
import { cpuShot, nextPosition } from "./ai/index.ts";
import {
  aimAngleGain,
  ballId,
  diagonalSlot,
  gradeSpecByName,
  gradeSpecs,
  gravityMs2,
  introMs,
  matchEndMs,
  matchMaxMs,
  maxAimAngle,
  paceBase,
  paceSpeedGain,
  pointEndMs,
  pointSettleMs,
  serveContactZ,
  serveFlightS,
  serveJitterX,
  serveJitterY,
  squeezeForceEndShots,
  squeezeMinReach,
  squeezeStartShots,
  squeezeStepFactor,
  squeezeStepShots,
  targetPoints,
  whiffErrorMs,
  whiffMaxZ,
} from "./constants.ts";
import type { Grade, Side, SlotName, SlotSpec } from "./constants.ts";
import { applyFloorBounceDrag, predict, stepBallPlan, stepHeight } from "./physics.ts";
import type { SwingInput } from "./input.ts";
import {
  findPlayer,
  findPlayerBySlot,
  findPlayerSlot,
  isAutoSlot,
  matchSlots,
  matchSlotSpecs,
  otherSide,
  sideEmpty,
  sideOfY,
  slotSpec,
} from "./state.ts";
import type { BallState, BandejaPlayer, BandejaState, PointReason, RallyState } from "./state.ts";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** ≤60 ms clean, ≤140 ms ok, ≤240 ms mishit, anything more is a whiff. */
function gradeFor(errorMs: number): Grade {
  const abs = Math.abs(errorMs);
  for (const spec of gradeSpecs) {
    if (abs <= spec.bandEnd) return spec.grade;
  }
  return "whiff";
}

/** Deterministic, not a random draw: grows across the band, signed by the timing error. */
function signedScatterDeg(grade: Grade, errorMs: number): number {
  const spec = gradeSpecByName.get(grade);
  if (spec === undefined || spec.maxScatterDeg === 0) return 0;
  const fraction = (Math.abs(errorMs) - spec.bandStart) / (spec.bandEnd - spec.bandStart);
  return Math.sign(errorMs) * spec.maxScatterDeg * fraction;
}

/** A rally past 30 shots shrinks every reach by 10% per further 6 shots, floor 0.8 m (rule 9). */
function effectiveReach(baseReach: number, shots: number): number {
  if (shots < squeezeStartShots) return baseReach;
  const extraSteps = 1 + Math.floor((shots - squeezeStartShots) / squeezeStepShots);
  return Math.max(squeezeMinReach, baseReach * squeezeStepFactor ** extraSteps);
}

/** `matchSlotSpecs`, with every reach shrunk for `shots` (rule 9): what `predict` looks ahead
 * for, so a slot's arrival window agrees with the same squeeze `applySwing`'s own reach check
 * uses — the closing ring CC-23.4 draws and the auto-return in `performAutoHit` both read it. */
function squeezedSlotSpecs(state: BandejaState, shots: number): SlotSpec[] {
  return matchSlotSpecs(state).map((spec) => ({
    ...spec,
    reach: effectiveReach(spec.reach, shots),
  }));
}

// --- onPlayerInput -------------------------------------------------------------------------------

/** `swing` (docs/games/bandeja.md, "What onPlayerInput does"). Everything else is ignored. */
export function onPlayerInput(
  state: BandejaState,
  player: Player,
  input: SwingInput,
  ctx: InputContext,
): BandejaState {
  if (state.phase !== "serve" && state.phase !== "rally") return state;
  if (input.payload.point !== state.point) return state;
  const found = findPlayerSlot(state, player.id);
  if (found === undefined || found.player.left) return state;
  return applySwing(state, found.player, found.slot, input, ctx);
}

function applySwing(
  state: BandejaState,
  swinger: BandejaPlayer,
  slot: SlotName,
  input: SwingInput,
  ctx: InputContext,
): BandejaState {
  if (state.ball === null || state.rally === null) return state;
  const spec = slotSpec(slot);
  const reach = effectiveReach(spec.reach, state.rally.shots);
  const ball = state.ball;
  const distance = Math.hypot(ball.body.x - spec.home[0], ball.body.y - spec.home[1]);
  const withinReach = distance <= reach;
  const onOwnSide = sideOfY(ball.body.y) === swinger.side;
  const heightOk = ball.z <= whiffMaxZ;
  const arriveAt = ball.leg.arrivals[slot];

  if (arriveAt === undefined || !withinReach || !onOwnSide || !heightOk) {
    return state; // A whiff: nothing changes but the phone's own send cooldown.
  }
  const actedMs = ctx.atMs - ctx.displayLagMs;
  const error = actedMs - arriveAt;
  const grade = gradeFor(error);
  if (grade === "whiff") return state;

  const aimDeg =
    (clamp(input.payload.angle, -maxAimAngle, maxAimAngle) / maxAimAngle) * aimAngleGain;
  const totalAngleDeg = aimDeg + signedScatterDeg(grade, error);
  const launched = launchBall(
    state,
    swinger.side,
    grade,
    totalAngleDeg,
    input.payload.speed,
    state.nowMs,
  );
  return clearMissStreak(launched, swinger.id);
}

function clearMissStreak(state: BandejaState, playerId: string): BandejaState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, missStreak: 0 } : player,
    ),
  };
}

/** Relaunches the ball from its current contact point at the given grade, aim and pace. */
function launchBall(
  state: BandejaState,
  side: Side,
  grade: Grade,
  totalAngleDeg: number,
  speedInput: number,
  nowMs: number,
): BandejaState {
  if (state.ball === null) return state;
  const spec = gradeSpecByName.get(grade);
  if (spec === undefined) return state;
  const paceMultiplier = paceBase + paceSpeedGain * speedInput;
  const planSpeed = spec.planSpeed * paceMultiplier;
  const rad = (totalAngleDeg * Math.PI) / 180;
  const vx = planSpeed * Math.sin(rad);
  const forward = side === "a" ? 1 : -1;
  const vy = forward * planSpeed * Math.cos(rad);
  const x = state.ball.body.x;
  const y = state.ball.body.y;
  const z = state.ball.z;
  const vz = spec.lift;
  const shots = (state.rally?.shots ?? 0) + 1;
  const leg = predict({ x, y, z, vx, vy, vz }, tickMs, nowMs, squeezedSlotSpecs(state, shots));
  const rally: RallyState = { shots, bounces: 0, bounceSide: null, pointSettleAtMs: null };
  return {
    ...state,
    ball: { body: { id: ballId, x, y, vx, vy, a: 0, w: 0 }, z, vz, leg },
    rally,
  };
}

// --- onTick ----------------------------------------------------------------------------------

/** Every slot this match uses (`matchSlots`), stepped one tick toward the ball's predicted landing
 * spot - or home, once there's no ball to chase (rule 3, CC-23.8: "Movement and a real CPU
 * partner"). Pure; `onTick` runs it once a tick before the phase switch below, and every phase
 * function already spreads its input state, so `positions` rides along without any of them needing
 * their own change. */
function steppedPositions(state: BandejaState, dtMs: number): BandejaState["positions"] {
  const positions = { ...state.positions };
  for (const slot of matchSlots(state)) {
    const spec = slotSpec(slot);
    positions[slot] = nextPosition(spec, positions[slot] ?? spec.home, state.ball, dtMs);
  }
  return positions;
}

/** Moves the match along at the fixed 60 Hz step. Time only comes from `dtMs`. */
export function onTick(state: BandejaState, dtMs: number): BandejaState {
  if (state.phase === "over") return state;
  const nowMs = state.nowMs + dtMs;
  const next: BandejaState = { ...state, nowMs, positions: steppedPositions(state, dtMs) };
  switch (state.phase) {
    case "intro":
      return tickIntro(next, nowMs);
    case "serve":
    case "rally":
      return tickServeOrRally(next, dtMs, nowMs);
    case "pointEnd":
      return tickPointEnd(next, nowMs);
  }
}

function tickIntro(state: BandejaState, nowMs: number): BandejaState {
  if (nowMs - state.phaseAtMs < introMs) return state;
  return startServe(state, nowMs);
}

/** `serve` and `rally` share the same ball physics; `serve` just relabels after 900 ms. */
function tickServeOrRally(state: BandejaState, dtMs: number, nowMs: number): BandejaState {
  const stepped = tickBall(state, dtMs, nowMs);
  if (stepped.phase !== "serve") return stepped;
  if (nowMs - stepped.phaseAtMs < 900) return stepped;
  return { ...stepped, phase: "rally", phaseAtMs: nowMs };
}

/** One physics step of the ball, plus the point-ending and arrival-resolution rules around it. */
function tickBall(state: BandejaState, dtMs: number, nowMs: number): BandejaState {
  if (state.ball === null || state.rally === null) return state;

  if (state.rally.pointSettleAtMs !== null && nowMs >= state.rally.pointSettleAtMs) {
    const bounceSide = state.rally.bounceSide as Side;
    return awardPoint(state, otherSide(bounceSide), "double-bounce", nowMs);
  }

  const ball = state.ball;
  const planStep = stepBallPlan(ball.body, ball.z);
  const heightStep = stepHeight(ball.z, ball.vz, dtMs / 1000);
  let body = planStep.body;
  const z = heightStep.z;
  const vz = heightStep.vz;
  if (heightStep.bounced) body = applyFloorBounceDrag(body);

  if (planStep.netContact) {
    const faultSide = sideOfY(body.y);
    return awardPoint(
      { ...state, ball: { ...ball, body, z, vz } },
      otherSide(faultSide),
      "net",
      nowMs,
    );
  }

  let rally: RallyState = state.rally;
  if (heightStep.bounced) {
    const bounceSide = sideOfY(body.y);
    const bounces = rally.bounceSide === bounceSide ? rally.bounces + 1 : 1;
    rally = { ...rally, bounces, bounceSide };
    // Set once, on the second bounce: a ball settling on the floor keeps micro-bouncing well
    // past that, and none of those later bounces should keep pushing the settle timer out.
    if (bounces >= 2 && rally.pointSettleAtMs === null) {
      rally = { ...rally, pointSettleAtMs: nowMs + pointSettleMs };
    }
  }

  const pathChanged = heightStep.bounced || planStep.wallContact;
  const leg = pathChanged
    ? predict(
        { x: body.x, y: body.y, z, vx: body.vx, vy: body.vy, vz },
        tickMs,
        nowMs,
        squeezedSlotSpecs(state, rally.shots),
      )
    : ball.leg;

  const ballState: BallState = { body, z, vz, leg };
  let next: BandejaState = { ...state, ball: ballState, rally };
  next = resolveArrivals(next, nowMs);

  if (next.phase !== "serve" && next.phase !== "rally") return next; // an arrival already ended it
  if ((next.rally?.shots ?? 0) >= squeezeForceEndShots) {
    return awardPoint(next, otherSide(next.serving), "squeeze", nowMs);
  }
  return next;
}

/** Auto-hits (immediately, at `arriveAt`) and records misses (once the window fully passes). */
function resolveArrivals(state: BandejaState, nowMs: number): BandejaState {
  const ball = state.ball;
  if (ball === null) return state;
  for (const entry of Object.entries(ball.leg.arrivals) as [SlotName, number][]) {
    const [slot, arriveAt] = entry;
    if (ball.leg.timedOut.includes(slot)) continue;
    if (isAutoSlot(state, slot)) {
      if (nowMs >= arriveAt) return performAutoHit(state, slot, nowMs);
    } else if (nowMs >= arriveAt + whiffErrorMs) {
      state = recordMiss(state, slot);
    }
  }
  return state;
}

function recordMiss(state: BandejaState, slot: SlotName): BandejaState {
  if (state.ball === null) return state;
  const player = findPlayerBySlot(state, slot);
  const players =
    player === undefined
      ? state.players
      : state.players.map((p) => (p.id === player.id ? { ...p, missStreak: p.missStreak + 1 } : p));
  return {
    ...state,
    players,
    ball: {
      ...state.ball,
      leg: { ...state.ball.leg, timedOut: [...state.ball.leg.timedOut, slot] },
    },
  };
}

/** An auto-returning slot hits every ball it can reach, at the real CPU's fixed difficulty and aim
 * (rule 10, replaced by CC-23.8: "no movement, no difficulty, and no aim" is exactly what this
 * stops being true of). Doesn't clear anyone's miss streak: only a real accepted swing does that. */
function performAutoHit(state: BandejaState, slot: SlotName, nowMs: number): BandejaState {
  const spec = slotSpec(slot);
  const shot = cpuShot(state, spec);
  return launchBall(state, spec.side, shot.grade, shot.angleDeg, shot.speed, nowMs);
}

function awardPoint(
  state: BandejaState,
  winner: Side,
  reason: PointReason,
  nowMs: number,
): BandejaState {
  const scores = { ...state.scores, [winner]: state.scores[winner] + 1 };
  return {
    ...state,
    phase: "pointEnd",
    phaseAtMs: nowMs,
    scores,
    ball: null,
    rally: null,
    lastPoint: { won: winner, reason },
  };
}

/** A side reached the target, or the clock passed its cap with the scores unequal (rule 8). */
function matchOverAt(state: BandejaState): boolean {
  const reachedTarget = state.scores.a >= targetPoints || state.scores.b >= targetPoints;
  const clockExpired = state.phaseAtMs >= matchMaxMs && state.scores.a !== state.scores.b;
  return reachedTarget || clockExpired;
}

function tickPointEnd(state: BandejaState, nowMs: number): BandejaState {
  const over = matchOverAt(state);
  const waitMs = over ? matchEndMs : pointEndMs;
  if (nowMs - state.phaseAtMs < waitMs) return state;
  if (over) return { ...state, phase: "over", phaseAtMs: nowMs };
  const serving = otherSide(state.serving);
  return startServe({ ...state, point: state.point + 1, serving }, nowMs);
}

/** Serves the ball into play (rule 4): the game hits it, never a player. */
function startServe(state: BandejaState, nowMs: number): BandejaState {
  const side = state.serving;
  const sideSlots = matchSlots(state).filter((slot) => slotSpec(slot).side === side);
  const servingSlot = nextServeSlot(sideSlots, state.lastServeSlot[side]);
  const serverSpec = slotSpec(servingSlot);
  const receiverSpec = slotSpec(diagonalSlot[servingSlot]);

  const rng = createRng(state.rng);
  const jitterX = (rng.next() * 2 - 1) * serveJitterX;
  const jitterY = (rng.next() * 2 - 1) * serveJitterY;
  const targetX = receiverSpec.home[0] + jitterX;
  const targetY = receiverSpec.home[1] + jitterY;

  const vx = (targetX - serverSpec.home[0]) / serveFlightS;
  const vy = (targetY - serverSpec.home[1]) / serveFlightS;
  const vz = (0.5 * gravityMs2 * serveFlightS ** 2 - serveContactZ) / serveFlightS;

  const x = serverSpec.home[0];
  const y = serverSpec.home[1];
  const z = serveContactZ;
  const leg = predict({ x, y, z, vx, vy, vz }, tickMs, nowMs, squeezedSlotSpecs(state, 1));
  const rally: RallyState = { shots: 1, bounces: 0, bounceSide: null, pointSettleAtMs: null };

  return {
    ...state,
    phase: "serve",
    phaseAtMs: nowMs,
    ball: { body: { id: ballId, x, y, vx, vy, a: 0, w: 0 }, z, vz, leg },
    rally,
    lastServeSlot: { ...state.lastServeSlot, [side]: servingSlot },
    rng: rng.state,
  };
}

/** Alternates within a side (rule 4); a single-slot side (singles) always serves from it. */
function nextServeSlot(sideSlots: readonly SlotName[], last: SlotName | null): SlotName {
  if (sideSlots.length <= 1) return sideSlots[0] as SlotName;
  if (last === null) return sideSlots[0] as SlotName;
  return sideSlots.find((slot) => slot !== last) ?? (sideSlots[0] as SlotName);
}

// --- onPlayerLeft ------------------------------------------------------------------------------

/**
 * A seat expired (rule 13): the slot auto-returns for the rest of the match, so their partner
 * isn't left alone. If a whole side empties, the match ends at once with placements.
 */
export function onPlayerLeft(state: BandejaState, player: Player): BandejaState {
  if (state.phase === "over") return state;
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left) return state;
  const left: BandejaState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? { ...p, left: true } : p)),
  };
  if (sideEmpty(left, "a") || sideEmpty(left, "b")) {
    return { ...left, phase: "over", phaseAtMs: state.nowMs, ball: null, rally: null };
  }
  return left;
}
