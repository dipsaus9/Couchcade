import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import {
  drawWindowMs,
  falseStartMs,
  fooledWindowMs,
  introMs,
  maxRounds,
  resultMs,
  slowMs,
  targetPoints,
} from "./constants.ts";
import type { QuickDrawInput } from "./input.ts";
import { startStandoff } from "./standoff.ts";
import { activePlayers, findPlayer } from "./state.ts";
import type { Practice, QuickDrawPlayer, QuickDrawState, TapResult } from "./state.ts";

/**
 * Judges a tap at game time `atMs`. It only compares against DRAW!, so a fake can never turn a
 * valid tap into a foul. `ctx.displayLagMs` is ignored on purpose: everyone watches the same TV,
 * and the calibrated lag includes a reaction time (spec, "Fairness").
 */
export function judgeTap(state: QuickDrawState, atMs: number): TapResult {
  const reactionMs = state.drawAtMs === null ? null : Math.round(atMs - state.drawAtMs);
  if (reactionMs === null || reactionMs < falseStartMs) {
    const fooled = state.fakes.some(
      (fake) => atMs >= fake.atMs && atMs < fake.atMs + fooledWindowMs,
    );
    return { kind: fooled ? "fooled" : "foul", ms: null, atMs };
  }
  return { kind: reactionMs <= slowMs ? "valid" : "slow", ms: reactionMs, atMs };
}

/**
 * A tap. Ignored outside `standoff` and `draw`, for another round, from a player who left, and
 * from a player who already has a result this round: only the first tap counts.
 */
export function onPlayerInput(
  state: QuickDrawState,
  player: Player,
  input: QuickDrawInput,
  ctx: InputContext,
): QuickDrawState {
  if (state.phase !== "standoff" && state.phase !== "draw") return state;
  if (input.payload.round !== state.round) return state;
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left || current.result !== null) return state;

  const result = judgeTap(state, ctx.atMs);
  return {
    ...state,
    players: state.players.map((other) => (other.id === player.id ? { ...other, result } : other)),
  };
}

/** True once any player has `targetPoints`, or the last round was played. */
export function isMatchDecided(state: QuickDrawState): boolean {
  return state.round >= maxRounds || state.players.some((player) => player.points >= targetPoints);
}

/**
 * Ends the round: players without a result are `slow`, the fastest valid reaction scores 1 point
 * (everyone on the same whole millisecond scores), and fouls cost nothing but the round.
 */
export function resolveRound(state: QuickDrawState): QuickDrawState {
  const players = state.players.map((player) =>
    player.left || player.result !== null
      ? player
      : { ...player, result: { kind: "slow" as const, ms: null, atMs: null } },
  );
  const validMs = players
    .filter((player) => !player.left && player.result?.kind === "valid")
    .map((player) => player.result?.ms as number);
  const fastestMs = validMs.length === 0 ? null : Math.min(...validMs);
  const winners = players
    .filter((player) => !player.left && player.result?.kind === "valid")
    .filter((player) => player.result?.ms === fastestMs)
    .map((player) => player.id);

  return {
    ...state,
    phase: "result",
    phaseAtMs: state.nowMs,
    winners,
    ...(state.practice ? { practice: practiceAfter(state.practice, players) } : {}),
    players: players.map((player) => {
      if (player.left || player.result?.kind !== "valid") return player;
      const ms = player.result.ms as number;
      return {
        ...player,
        points: player.points + (winners.includes(player.id) ? 1 : 0),
        bestMs: player.bestMs === null ? ms : Math.min(player.bestMs, ms),
      };
    }),
  };
}

/**
 * Solo practice after a round: a valid reaction adds to the average and is a new best when it
 * beats the best before it (the first one always is). `players` still has the old `bestMs`.
 */
function practiceAfter(practice: Practice, players: readonly QuickDrawPlayer[]): Practice {
  const player = players.find((candidate) => !candidate.left);
  const ms = player?.result?.kind === "valid" ? player.result.ms : null;
  if (player === undefined || ms === null) return { ...practice, newBest: false };
  return {
    totalMs: practice.totalMs + ms,
    validTaps: practice.validTaps + 1,
    newBest: player.bestMs === null || ms < player.bestMs,
  };
}

/** Moves the round along at the fixed 60 Hz step. Time only comes from `dtMs`. */
export function onTick(state: QuickDrawState, dtMs: number): QuickDrawState {
  if (state.phase === "over") return state;
  const nowMs = state.nowMs + dtMs;
  const next = { ...state, nowMs };
  // Due times sit on the tick grid. Half a tick of slack absorbs float rounding in the sums.
  const reached = (dueMs: number): boolean => nowMs >= dueMs - dtMs / 2;

  switch (state.phase) {
    case "intro":
      return reached(state.phaseAtMs + introMs) ? startStandoff(next, dtMs) : next;
    case "standoff":
      return state.drawDueMs !== null && reached(state.drawDueMs)
        ? { ...next, phase: "draw", phaseAtMs: nowMs, drawAtMs: nowMs }
        : next;
    case "draw": {
      const everyoneDone = activePlayers(state).every((player) => player.result !== null);
      const windowOver = state.drawAtMs !== null && reached(state.drawAtMs + drawWindowMs);
      return everyoneDone || windowOver ? resolveRound(next) : next;
    }
    case "result":
      if (!reached(state.phaseAtMs + resultMs)) return next;
      return isMatchDecided(state)
        ? { ...next, phase: "over", phaseAtMs: nowMs }
        : { ...next, phase: "intro", phaseAtMs: nowMs, round: state.round + 1 };
  }
}

/**
 * A seat expired. The player keeps their points but can't score again, and the round no longer
 * waits for them. With fewer than 2 players left the match ends at once, so solo practice ends
 * when its player leaves.
 */
export function onPlayerLeft(state: QuickDrawState, player: Player): QuickDrawState {
  if (state.phase === "over") return state;
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left) return state;
  const next = {
    ...state,
    players: state.players.map((other) =>
      other.id === player.id ? { ...other, left: true } : other,
    ),
  };
  return activePlayers(next).length < 2 ? { ...next, phase: "over", phaseAtMs: state.nowMs } : next;
}
