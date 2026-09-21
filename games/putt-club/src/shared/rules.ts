/**
 * Putt Club's rules (docs/games/putt-club.md, "Rules and scoring", "Stroke flow and timings" and
 * "Aim, then power"): pure functions over `PuttClubState`. `onTick` drives the phase clock and
 * steps `@couchcade/physics` during `rolling`; `onPlayerInput` only ever changes state for the
 * current putter's own turn.
 */
import { addSample } from "@couchcade/game-sdk/input";
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import { course } from "./course.ts";
import {
  autoPuttWaitMs,
  awayAfterAutoPutts,
  awayInputExtensionMs,
  awayTurnTimerMs,
  holeCount,
  holeEndLastMs,
  holeEndMs,
  holeIntroMs,
  introMs,
  resultMs,
  resultWithCalloutMs,
  strokeCap,
  turnTimerMs,
} from "./constants.ts";
import { distance } from "./geometry.ts";
import type { Hole } from "./hole.ts";
import type { AimInput, LineInput, PuttClubInput, PuttInput } from "./input.ts";
import {
  autoPuttSpeedParam,
  isStrokeSettled,
  resetSpot,
  startStroke,
  stepStroke,
} from "./physics.ts";
import {
  activePlayers,
  activeSeats,
  findPlayer,
  findPlayerBySeat,
  honourSeat,
  scoresSnapshot,
  seatAfter,
  seatAtOrAfter,
  seatsInPlay,
} from "./state.ts";
import type { LastStroke, PuttClubPlayer, PuttClubState, StrokeOutcome } from "./state.ts";

// --- onPlayerInput -----------------------------------------------------------------------------

/**
 * `aim`, `line` or `putt` (docs/games/putt-club.md, "What `onPlayerInput` does"). Accepted only
 * from the current putter, in `turn`, with `payload.turn` equal to the current turn. Anything
 * else is ignored, including a `putt` that arrives after the auto-putt already fired.
 */
export function onPlayerInput(
  state: PuttClubState,
  player: Player,
  input: PuttClubInput,
  ctx: InputContext,
): PuttClubState {
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left) return state;
  switch (input.type) {
    case "aim":
      return applyAim(state, current, input, ctx);
    case "line":
      return applyLine(state, current, input, ctx);
    case "putt":
      return applyPutt(state, current, input, ctx);
  }
}

function isPuttersTurn(state: PuttClubState, playerId: string, turn: number): boolean {
  return state.phase === "turn" && state.putterId === playerId && turn === state.turn;
}

/** An accepted input from an away putter pushes this turn's deadline to 10,000 ms after it. */
function clearAwayExtension(
  state: PuttClubState,
  player: PuttClubPlayer,
  ctx: InputContext,
): PuttClubState {
  if (!state.awayAtTurnStart || state.putterId !== player.id || state.deadlineMs === null) {
    return state;
  }
  const extended = ctx.atMs + awayInputExtensionMs;
  return extended > state.deadlineMs ? { ...state, deadlineMs: extended } : state;
}

function applyAim(
  state: PuttClubState,
  player: PuttClubPlayer,
  input: AimInput,
  ctx: InputContext,
): PuttClubState {
  if (state.phase !== "turn" || state.putterId !== player.id || state.locked) return state;
  const extended = clearAwayExtension(state, player, ctx);
  const aim = addSample<[number, number]>(extended.aim, ctx.atMs, [
    input.payload.yaw,
    input.payload.pitch,
  ]);
  return { ...extended, aim };
}

function applyLine(
  state: PuttClubState,
  player: PuttClubPlayer,
  input: LineInput,
  ctx: InputContext,
): PuttClubState {
  if (!isPuttersTurn(state, player.id, input.payload.turn)) return state;
  const extended = clearAwayExtension(state, player, ctx);
  return { ...extended, locked: input.payload.locked };
}

function applyPutt(
  state: PuttClubState,
  player: PuttClubPlayer,
  input: PuttInput,
  ctx: InputContext,
): PuttClubState {
  if (!isPuttersTurn(state, player.id, input.payload.turn)) return state;
  if (state.deadlineMs === null || ctx.atMs > state.deadlineMs) return state;
  const { yaw, speed, angle } = input.payload;
  return beginStroke(state, player, { yaw, speed, angle, auto: false, atMs: ctx.atMs });
}

// --- onTick --------------------------------------------------------------------------------

/** Moves the match along at the fixed 60 Hz step. Time only comes from `dtMs`. */
export function onTick(state: PuttClubState, dtMs: number): PuttClubState {
  if (state.phase === "over") return state;
  const nowMs = state.nowMs + dtMs;
  const next: PuttClubState = { ...state, nowMs };
  switch (state.phase) {
    case "intro":
      return nowMs - state.phaseAtMs >= introMs ? openHole(next, 1, nowMs) : next;
    case "holeIntro":
      return nowMs - state.phaseAtMs >= holeIntroMs
        ? openTurn(next, next.hole === 1 ? next.turn : next.turn + 1, nowMs)
        : next;
    case "turn":
      return tickTurn(next, nowMs);
    case "rolling":
      return tickRolling(next, nowMs);
    case "result":
      return tickResult(next, nowMs);
    case "holeEnd":
      return tickHoleEnd(next, nowMs);
  }
}

function tickTurn(state: PuttClubState, nowMs: number): PuttClubState {
  if (state.deadlineMs === null || state.putterId === null) return state;
  if (nowMs < state.deadlineMs + autoPuttWaitMs) return state;
  const putter = findPlayer(state, state.putterId);
  if (putter === undefined) return state;
  const hole = course[state.hole - 1] as Hole;
  const speed = autoPuttSpeedParam(distance(putter.ball, hole.cup));
  return beginStroke(state, putter, { yaw: 0, speed, angle: 0, auto: true, atMs: nowMs });
}

function tickRolling(state: PuttClubState, nowMs: number): PuttClubState {
  if (state.activeStroke === null) return state;
  const hole = course[state.hole - 1] as Hole;
  const stepped = stepStroke(state.activeStroke, hole);
  if (!isStrokeSettled(stepped, nowMs)) return { ...state, activeStroke: stepped };
  return settleStroke({ ...state, activeStroke: stepped }, nowMs);
}

function tickResult(state: PuttClubState, nowMs: number): PuttClubState {
  const result = findPlayer(state, state.putterId)?.last?.result;
  const waitMs = result === "holed" ? resultWithCalloutMs : resultMs;
  return nowMs - state.phaseAtMs < waitMs ? state : advanceAfterResult(state, nowMs);
}

function tickHoleEnd(state: PuttClubState, nowMs: number): PuttClubState {
  const waitMs = state.hole >= holeCount ? holeEndLastMs : holeEndMs;
  if (nowMs - state.phaseAtMs < waitMs) return state;
  if (state.hole >= holeCount) return endMatch(state, nowMs);
  if (activeSeats(state).length === 0) return endMatch(state, nowMs);
  return openHole(state, state.hole + 1, nowMs);
}

// --- shared transitions ------------------------------------------------------------------------

function isAway(player: PuttClubPlayer): boolean {
  return (
    player.recentAuto.length >= awayAfterAutoPutts &&
    player.recentAuto.slice(-awayAfterAutoPutts).every(Boolean)
  );
}

/** Hole `hole`'s `holeIntro`: every ball to the tee, the honour seat named, scores snapshotted. */
function openHole(state: PuttClubState, hole: number, nowMs: number): PuttClubState {
  const holeStart = scoresSnapshot(state, hole);
  const holeData = course[hole - 1] as Hole;
  const resetPlayers = state.players.map((player) => ({
    ...player,
    ball: holeData.tee,
    doneHole: false,
    strokes: 0,
  }));
  const withPlayers: PuttClubState = { ...state, players: resetPlayers };
  const startSeat = seatAtOrAfter(activeSeats(withPlayers), honourSeat(hole, state.players.length));
  const putter = startSeat === undefined ? undefined : findPlayerBySeat(withPlayers, startSeat);
  return {
    ...withPlayers,
    hole,
    phase: "holeIntro",
    phaseAtMs: nowMs,
    putterId: putter?.id ?? null,
    deadlineMs: null,
    awayAtTurnStart: false,
    aim: [],
    locked: false,
    activeStroke: null,
    holeStart,
  };
}

/** Opens `turn` for `state.putterId` at match-wide stroke number `turn`. */
function openTurn(state: PuttClubState, turn: number, nowMs: number): PuttClubState {
  const putter = findPlayer(state, state.putterId);
  const away = putter !== undefined && isAway(putter);
  return {
    ...state,
    phase: "turn",
    phaseAtMs: nowMs,
    turn,
    deadlineMs: nowMs + (away ? awayTurnTimerMs : turnTimerMs),
    awayAtTurnStart: away,
    aim: [],
    locked: false,
  };
}

interface BeginStrokeOptions {
  /** −1 to 1. */
  yaw: number;
  /** 0 to 1. */
  speed: number;
  /** −180 to 180 degrees. */
  angle: number;
  auto: boolean;
  atMs: number;
}

function beginStroke(
  state: PuttClubState,
  putter: PuttClubPlayer,
  options: BeginStrokeOptions,
): PuttClubState {
  const hole = course[state.hole - 1] as Hole;
  const activeStroke = startStroke({
    playerId: putter.id,
    hole: state.hole,
    strokeNumber: putter.strokes + 1,
    turn: state.turn,
    auto: options.auto,
    atMs: options.atMs,
    ball: putter.ball,
    cup: hole.cup,
    yaw: options.yaw,
    speed: options.speed,
    angle: options.angle,
  });
  return {
    ...state,
    phase: "rolling",
    phaseAtMs: options.atMs,
    deadlineMs: null,
    aim: [],
    locked: false,
    activeStroke,
  };
}

/**
 * Records the finished-or-departed part of a hole for `player`: the hole in progress gets
 * `player.strokes` as its score (if it doesn't already have one), and every hole after it that's
 * still open gets `strokeCap` — a departed player's scorecard stays comparable (rule 14).
 */
function finalizeHole(player: PuttClubPlayer, holeIndex: number): PuttClubPlayer {
  const scores = player.scores.map((score, index) => {
    if (index === holeIndex && score === null) return player.strokes;
    if (index > holeIndex && score === null) return strokeCap;
    return score;
  });
  const total = scores.reduce((sum: number, score) => sum + (score ?? 0), 0);
  return { ...player, doneHole: true, scores, total };
}

/** The roll settled ("Rules and scoring" rules 7, 8, 9): scores it and moves to `result`. */
function settleStroke(state: PuttClubState, nowMs: number): PuttClubState {
  const stroke = state.activeStroke as NonNullable<PuttClubState["activeStroke"]>;
  const putter = findPlayer(state, stroke.playerId) as PuttClubPlayer;
  const hole = course[state.hole - 1] as Hole;

  const holedNow = stroke.outcome === "holed";
  const penalised = stroke.outcome === "offPlay";
  const rawStrokes = stroke.strokeNumber + (penalised ? 1 : 0);
  const cappedNow = !holedNow && rawStrokes >= strokeCap;
  const strokesOnHole = cappedNow ? strokeCap : rawStrokes;
  const finishesHole = holedNow || cappedNow;

  const ball = holedNow
    ? hole.cup
    : penalised
      ? resetSpot(stroke.path, hole, putter.ball)
      : ([stroke.ball.x, stroke.ball.y] as const);

  const result: StrokeOutcome = holedNow
    ? "holed"
    : cappedNow
      ? "capped"
      : penalised
        ? "penalty"
        : "rolled";
  const last: LastStroke = {
    result,
    strokes: strokesOnHole,
    hole: finishesHole ? strokesOnHole : null,
    auto: stroke.auto,
  };
  const recentAuto = [...putter.recentAuto, stroke.auto].slice(-awayAfterAutoPutts);

  const updated: PuttClubPlayer = {
    ...putter,
    ball,
    strokes: strokesOnHole,
    doneHole: finishesHole,
    scores: finishesHole
      ? putter.scores.map((score, index) => (index === state.hole - 1 ? strokesOnHole : score))
      : putter.scores,
    total: finishesHole ? putter.total + strokesOnHole : putter.total,
    last,
    recentAuto,
  };
  const finalPlayer = putter.left ? finalizeHole(updated, state.hole - 1) : updated;

  return {
    ...state,
    phase: "result",
    phaseAtMs: nowMs,
    activeStroke: null,
    players: state.players.map((player) => (player.id === putter.id ? finalPlayer : player)),
  };
}

/**
 * After `result`'s wait: the next active player still in play on this hole, in seat order after
 * the one who just putted, or `holeEnd` once everyone has holed out or reached the cap.
 */
function advanceAfterResult(state: PuttClubState, nowMs: number): PuttClubState {
  const seats = seatsInPlay(state);
  if (seats.length === 0) {
    return { ...state, phase: "holeEnd", phaseAtMs: nowMs, putterId: null };
  }
  const putter = findPlayer(state, state.putterId);
  const nextSeat = seatAfter(seats, putter?.seat ?? -1);
  const nextPutter = nextSeat === undefined ? undefined : findPlayerBySeat(state, nextSeat);
  const withPutter: PuttClubState = { ...state, putterId: nextPutter?.id ?? null };
  return openTurn(withPutter, state.turn + 1, nowMs);
}

function endMatch(state: PuttClubState, nowMs: number): PuttClubState {
  return {
    ...state,
    phase: "over",
    phaseAtMs: nowMs,
    activeStroke: null,
    putterId: null,
    deadlineMs: null,
    holeStart: scoresSnapshot(state, holeCount + 1),
  };
}

// --- onPlayerLeft --------------------------------------------------------------------------

/**
 * A seat expired (rule 14): the player keeps the holes they finished and plays no more. A hole in
 * progress records their strokes so far, plus `strokeCap` for the holes they never reached, so the
 * scorecard stays comparable. If they were on the clock, the turn passes at once; if their ball is
 * rolling, the stroke finishes and counts (`settleStroke` finalizes a `left` player the same way),
 * then the turn passes.
 */
export function onPlayerLeft(state: PuttClubState, player: Player): PuttClubState {
  if (state.phase === "over") return state;
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left) return state;

  const isRollingNow = state.phase === "rolling" && state.activeStroke?.playerId === player.id;
  const updated: PuttClubPlayer = isRollingNow
    ? { ...current, left: true }
    : { ...finalizeHole(current, state.hole - 1), left: true };

  const next: PuttClubState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? updated : p)),
  };

  if (activePlayers(next).length === 0) return endMatch(next, state.nowMs);
  if (isRollingNow) return next;
  if (next.phase === "turn" && next.putterId === player.id) {
    return advanceAfterResult(next, state.nowMs);
  }
  return next;
}
