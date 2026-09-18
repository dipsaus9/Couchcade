/**
 * Strike Night's rules (docs/games/strike-night.md, "Rules and scoring" and "Turn flow and
 * timings"): pure functions over `StrikeNightState`. `onTick` drives the phase clock and steps
 * `@couchcade/physics` during `rolling`; `onPlayerInput` only ever changes state for the current
 * bowler's own turn.
 */
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import {
  autoRollAngle,
  autoRollSpeed,
  autoRollSpin,
  autoRollWaitMs,
  awayAfterAutoRolls,
  awayInputExtensionMs,
  awayTurnTimerMs,
  frameCount,
  frameEndLastMs,
  frameEndMs,
  introMs,
  resultMs,
  resultWithCalloutMs,
  turnTimerMs,
} from "./constants.ts";
import type { BowlInput, GripInput, MoveInput, StrikeNightInput } from "./input.ts";
import { isRollSettled, pinIsDown, startRoll, stepRoll } from "./physics.ts";
import {
  activePlayers,
  activeSeats,
  allPinIds,
  findPlayer,
  findPlayerBySeat,
  frameComplete,
  scoreFrame,
  scoresSnapshot,
} from "./state.ts";
import type {
  ActiveRoll,
  FrameRecord,
  RollMark,
  RollResult,
  StrikeNightPlayer,
  StrikeNightState,
} from "./state.ts";

// --- onPlayerInput -----------------------------------------------------------------------------

/**
 * `move`, `grip` or `bowl` (docs/games/strike-night.md, "What `onPlayerInput` does"). Accepted
 * only from the current bowler, in `lineup`, with `payload.turn` equal to the current turn.
 * Anything else is ignored, including a `bowl` that arrives after the auto-roll.
 */
export function onPlayerInput(
  state: StrikeNightState,
  player: Player,
  input: StrikeNightInput,
  ctx: InputContext,
): StrikeNightState {
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left) return state;
  switch (input.type) {
    case "move":
      return applyMove(state, current, input, ctx);
    case "grip":
      return applyGrip(state, current, input, ctx);
    case "bowl":
      return applyBowl(state, current, input, ctx);
  }
}

function isBowlersTurn(state: StrikeNightState, playerId: string, turn: number): boolean {
  return state.phase === "lineup" && state.bowlerId === playerId && turn === state.turn;
}

/** An accepted input from an away bowler pushes this lineup's deadline to 15,000 ms after it. */
function clearAwayExtension(
  state: StrikeNightState,
  player: StrikeNightPlayer,
  ctx: InputContext,
): StrikeNightState {
  if (!state.awayAtLineupStart || state.bowlerId !== player.id || state.deadlineMs === null) {
    return state;
  }
  const extended = ctx.atMs + awayInputExtensionMs;
  return extended > state.deadlineMs ? { ...state, deadlineMs: extended } : state;
}

function updatePlayer(
  state: StrikeNightState,
  id: string,
  change: Partial<StrikeNightPlayer>,
): StrikeNightState {
  return {
    ...state,
    players: state.players.map((player) => (player.id === id ? { ...player, ...change } : player)),
  };
}

function applyMove(
  state: StrikeNightState,
  player: StrikeNightPlayer,
  input: MoveInput,
  ctx: InputContext,
): StrikeNightState {
  if (!isBowlersTurn(state, player.id, input.payload.turn)) return state;
  const extended = clearAwayExtension(state, player, ctx);
  return updatePlayer(extended, player.id, { x: input.payload.x });
}

function applyGrip(
  state: StrikeNightState,
  player: StrikeNightPlayer,
  input: GripInput,
  ctx: InputContext,
): StrikeNightState {
  if (!isBowlersTurn(state, player.id, input.payload.turn)) return state;
  const extended = clearAwayExtension(state, player, ctx);
  return updatePlayer(extended, player.id, { gripped: input.payload.held });
}

function applyBowl(
  state: StrikeNightState,
  player: StrikeNightPlayer,
  input: BowlInput,
  ctx: InputContext,
): StrikeNightState {
  if (!isBowlersTurn(state, player.id, input.payload.turn)) return state;
  if (state.deadlineMs === null || ctx.atMs > state.deadlineMs) return state;
  const { x, speed, angle, spin } = input.payload;
  return beginRoll(state, player, { x, speed, angle, spin, auto: false, atMs: ctx.atMs });
}

// --- onTick --------------------------------------------------------------------------------

/** Moves the match along at the fixed 60 Hz step. Time only comes from `dtMs`. */
export function onTick(state: StrikeNightState, dtMs: number): StrikeNightState {
  if (state.phase === "over") return state;
  const nowMs = state.nowMs + dtMs;
  const next: StrikeNightState = { ...state, nowMs };
  switch (state.phase) {
    case "intro":
      return nowMs - state.phaseAtMs >= introMs
        ? startLineup(next, {
            frame: 1,
            roll: 1,
            bowlerId: next.bowlerId as string,
            turn: next.turn,
            nowMs,
          })
        : next;
    case "lineup":
      return tickLineup(next, nowMs);
    case "rolling":
      return tickRolling(next, nowMs);
    case "result":
      return tickResult(next, nowMs);
    case "frameEnd":
      return tickFrameEnd(next, nowMs);
  }
}

function tickLineup(state: StrikeNightState, nowMs: number): StrikeNightState {
  if (state.deadlineMs === null || state.bowlerId === null) return state;
  if (nowMs < state.deadlineMs + autoRollWaitMs) return state;
  const bowler = findPlayer(state, state.bowlerId);
  if (bowler === undefined) return state;
  return beginRoll(state, bowler, {
    x: bowler.x,
    speed: autoRollSpeed,
    angle: autoRollAngle,
    spin: autoRollSpin,
    auto: true,
    atMs: nowMs,
  });
}

function tickRolling(state: StrikeNightState, nowMs: number): StrikeNightState {
  if (state.activeRoll === null) return state;
  const stepped = stepRoll(state.activeRoll, nowMs);
  if (!isRollSettled(stepped, nowMs)) return { ...state, activeRoll: stepped };
  return settleRoll({ ...state, activeRoll: stepped }, nowMs);
}

function tickResult(state: StrikeNightState, nowMs: number): StrikeNightState {
  const mark = findPlayer(state, state.bowlerId)?.last?.mark;
  const waitMs = mark === "strike" || mark === "spare" ? resultWithCalloutMs : resultMs;
  return nowMs - state.phaseAtMs < waitMs ? state : advanceAfterResult(state, nowMs);
}

function tickFrameEnd(state: StrikeNightState, nowMs: number): StrikeNightState {
  const waitMs = state.frame >= frameCount ? frameEndLastMs : frameEndMs;
  if (nowMs - state.phaseAtMs < waitMs) return state;
  if (state.frame >= frameCount) return endMatch(state, nowMs);
  const seats = activeSeats(state);
  if (seats.length === 0) return endMatch(state, nowMs);
  const nextFrame = state.frame + 1;
  const firstBowler = findPlayerBySeat(state, seats[0] as number) as StrikeNightPlayer;
  const withFrameStart: StrikeNightState = {
    ...state,
    frame: nextFrame,
    frameStart: scoresSnapshot(state, nextFrame),
  };
  return startLineup(withFrameStart, {
    frame: nextFrame,
    roll: 1,
    bowlerId: firstBowler.id,
    turn: state.turn + 1,
    nowMs,
  });
}

// --- shared transitions ------------------------------------------------------------------------

function isAway(player: StrikeNightPlayer): boolean {
  return (
    player.recentAuto.length >= awayAfterAutoRolls &&
    player.recentAuto.slice(-awayAfterAutoRolls).every(Boolean)
  );
}

interface LineupParams {
  frame: number;
  roll: 1 | 2;
  bowlerId: string;
  turn: number;
  nowMs: number;
}

function startLineup(state: StrikeNightState, params: LineupParams): StrikeNightState {
  const bowler = findPlayer(state, params.bowlerId);
  const away = bowler !== undefined && isAway(bowler);
  const standingPins = params.roll === 1 ? [...allPinIds] : state.standingPins;
  return {
    ...state,
    phase: "lineup",
    frame: params.frame,
    roll: params.roll,
    turn: params.turn,
    bowlerId: params.bowlerId,
    phaseAtMs: params.nowMs,
    deadlineMs: params.nowMs + (away ? awayTurnTimerMs : turnTimerMs),
    awayAtLineupStart: away,
    standingPins,
    activeRoll: null,
  };
}

interface BeginRollOptions {
  x: number;
  speed: number;
  angle: number;
  spin: number;
  auto: boolean;
  atMs: number;
}

function beginRoll(
  state: StrikeNightState,
  bowler: StrikeNightPlayer,
  options: BeginRollOptions,
): StrikeNightState {
  const activeRoll = startRoll({
    bowlerId: bowler.id,
    frame: state.frame,
    roll: state.roll,
    turn: state.turn,
    auto: options.auto,
    releaseAtMs: options.atMs,
    x: options.x,
    speed: options.speed,
    angle: options.angle,
    spin: options.spin,
    standingIds: state.standingPins,
  });
  return {
    ...state,
    phase: "rolling",
    phaseAtMs: options.atMs,
    deadlineMs: null,
    activeRoll,
    players: state.players.map((player) =>
      player.id === bowler.id ? { ...player, x: options.x, gripped: false } : player,
    ),
  };
}

/** The roll settled ("Gutters, settling and counting"): scores it and moves to `result`. */
function settleRoll(state: StrikeNightState, nowMs: number): StrikeNightState {
  const roll = state.activeRoll as ActiveRoll;
  const downIds = new Set(roll.pins.filter(pinIsDown).map((pin) => pin.id));
  const pinsKnocked = downIds.size;
  const stillStanding = roll.pins.filter((pin) => !downIds.has(pin.id)).map((pin) => pin.id);
  const nextStandingPins = roll.roll === 1 ? stillStanding : state.standingPins;

  const mark: RollMark = roll.gutter
    ? "gutter"
    : roll.roll === 1 && pinsKnocked === 10
      ? "strike"
      : roll.roll === 2 && stillStanding.length === 0
        ? "spare"
        : "open";

  const bowler = findPlayer(state, roll.bowlerId) as StrikeNightPlayer;
  const frameRecord = bowler.frames[roll.frame - 1] as FrameRecord;
  const updatedFrame: FrameRecord =
    roll.roll === 1
      ? { ...frameRecord, roll1: pinsKnocked }
      : { ...frameRecord, roll2: pinsKnocked };
  const justCompleted = frameComplete(updatedFrame);
  const frameScore = justCompleted ? scoreFrame(updatedFrame) : null;
  const finalFrame: FrameRecord = justCompleted
    ? { ...updatedFrame, score: frameScore }
    : updatedFrame;

  const last: RollResult = { pins: pinsKnocked, mark, auto: roll.auto, frame: frameScore };
  const recentAuto = [...bowler.recentAuto, roll.auto].slice(-awayAfterAutoRolls);

  const updatedPlayer: StrikeNightPlayer = {
    ...bowler,
    frames: bowler.frames.map((frame, index) => (index === roll.frame - 1 ? finalFrame : frame)),
    last,
    recentAuto,
    total: justCompleted ? bowler.total + (frameScore as number) : bowler.total,
    strikes: mark === "strike" ? bowler.strikes + 1 : bowler.strikes,
    spares: mark === "spare" ? bowler.spares + 1 : bowler.spares,
  };

  return {
    ...state,
    phase: "result",
    phaseAtMs: nowMs,
    standingPins: nextStandingPins,
    activeRoll: null,
    players: state.players.map((player) => (player.id === bowler.id ? updatedPlayer : player)),
  };
}

/**
 * After `result`'s wait: the same bowler's roll 2 (roll 1 wasn't a strike), the next active
 * bowler's roll 1, or `frameEnd` when the last active bowler just finished this frame.
 */
function advanceAfterResult(state: StrikeNightState, nowMs: number): StrikeNightState {
  const bowler = findPlayer(state, state.bowlerId);
  const frameRecord = bowler?.frames[state.frame - 1];
  if (
    bowler !== undefined &&
    !bowler.left &&
    frameRecord !== undefined &&
    !frameComplete(frameRecord)
  ) {
    return startLineup(state, {
      frame: state.frame,
      roll: 2,
      bowlerId: bowler.id,
      turn: state.turn + 1,
      nowMs,
    });
  }

  const seats = activeSeats(state);
  if (seats.length === 0) return endMatch(state, nowMs);
  const currentSeat = bowler?.seat ?? -1;
  const nextSeat = seats.find((seat) => seat > currentSeat);
  if (nextSeat === undefined) return { ...state, phase: "frameEnd", phaseAtMs: nowMs };
  const nextBowler = findPlayerBySeat(state, nextSeat) as StrikeNightPlayer;
  return startLineup(state, {
    frame: state.frame,
    roll: 1,
    bowlerId: nextBowler.id,
    turn: state.turn + 1,
    nowMs,
  });
}

function endMatch(state: StrikeNightState, nowMs: number): StrikeNightState {
  return {
    ...state,
    phase: "over",
    phaseAtMs: nowMs,
    activeRoll: null,
    deadlineMs: null,
    frameStart: scoresSnapshot(state, frameCount + 1),
  };
}

// --- onPlayerLeft --------------------------------------------------------------------------

/**
 * A seat expired (edge cases, "Seat expires mid-match"): the player keeps their points and bowls
 * no more frames. A pending lineup passes at once; a roll already in flight finishes and counts
 * (their `left` flag only takes effect once `advanceAfterResult` looks for the next bowler).
 */
export function onPlayerLeft(state: StrikeNightState, player: Player): StrikeNightState {
  if (state.phase === "over") return state;
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left) return state;
  const left: StrikeNightState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? { ...p, left: true } : p)),
  };
  if (activePlayers(left).length === 0) return endMatch(left, state.nowMs);
  if (left.phase === "lineup" && left.bowlerId === player.id) {
    return advanceAfterResult(left, state.nowMs);
  }
  return left;
}
