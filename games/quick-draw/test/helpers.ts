import { createFakeRoom, createPlayers } from "@couchcade/game-sdk/testing";
import { tickMs, tickTimeMs } from "@couchcade/game-sdk/contract";
import type { FakeRoom, Recording } from "@couchcade/game-sdk/testing";
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import game from "../src/index.ts";
import { onTick } from "../src/shared/index.ts";
import type { Phase, QuickDrawInput, QuickDrawState, QuickDrawView } from "../src/shared/index.ts";

export type QuickDrawRoom = FakeRoom<QuickDrawInput, QuickDrawState, QuickDrawView>;

export const tap = (round: number): QuickDrawInput => ({ type: "draw", payload: { round } });

export const ctxAt = (atMs: number, nowMs = atMs): InputContext => ({
  atMs,
  nowMs,
  displayLagMs: 0,
});

export function room(players: number | readonly Player[], seed = 1): QuickDrawRoom {
  return createFakeRoom(game, { players, seed });
}

/** Ticks a room until the phase is `phase` (and the round is `round`, when given). */
export function stepUntil(target: QuickDrawRoom, phase: Phase, round?: number): QuickDrawState {
  for (let i = 0; i < 60 * 60 * 10; i++) {
    const { state } = target;
    if (state.phase === phase && (round === undefined || state.round === round)) return state;
    if (target.over) break;
    target.step();
  }
  throw new Error(`Never reached ${phase}${round === undefined ? "" : ` in round ${round}`}`);
}

/** Ticks a bare state (no room) until the phase is `phase`. */
export function tickUntil(state: QuickDrawState, phase: Phase): QuickDrawState {
  let next = state;
  for (let i = 0; i < 60 * 60 && next.phase !== phase; i++) next = onTick(next, tickMs);
  if (next.phase !== phase) throw new Error(`Never reached ${phase}`);
  return next;
}

/**
 * Queues a tap for the tick that first reaches `arriveMs` (defaults to `atMs`), stamped with
 * `atMs`, the way a phone's clock-synced tap reaches the host after network delay.
 */
export function tapAt(
  target: QuickDrawRoom,
  playerId: string,
  atMs: number,
  arriveMs = atMs,
): QuickDrawState {
  while (tickTimeMs(target.tick + 1) < arriveMs - 1e-6) target.step();
  target.input(playerId, tap(target.state.round), atMs);
  return target.step();
}

/** Tap plan for one player in one round: when they tap relative to DRAW!, or null for no tap. */
export type Plan = (round: number, slot: number, state: QuickDrawState) => number | null;

/**
 * Plays a full match with bot players that know when DRAW! is due. A plan returns the reaction
 * in ms (negative taps before DRAW!), and every tap arrives `delayMs` after it was made.
 */
export function playMatch(seed: number, players: number, plan: Plan, delayMs = 0): QuickDrawRoom {
  const target = room(createPlayers(players), seed);
  let plannedRound = 0;
  let pending: Array<{ playerId: string; atMs: number; round: number }> = [];

  for (let i = 0; i < 60 * 60 * 10 && !target.over; i++) {
    const { state } = target;
    if (state.phase === "standoff" && plannedRound !== state.round) {
      plannedRound = state.round;
      pending = [];
      state.players.forEach((player, slot) => {
        const reaction = plan(state.round, slot, state);
        if (reaction !== null && state.drawDueMs !== null) {
          pending.push({
            playerId: player.id,
            atMs: state.drawDueMs + reaction,
            round: state.round,
          });
        }
      });
    }
    const nextNowMs = tickTimeMs(target.tick + 1);
    pending = pending.filter((entry) => {
      if (entry.atMs + delayMs > nextNowMs + 1e-6) return true;
      target.input(entry.playerId, tap(entry.round), entry.atMs);
      return false;
    });
    target.step();
  }
  return target;
}

/**
 * Plays a recording tick by tick in a new room and calls `onStep` with the state before each
 * tick. Stops when the match is over or `onStep` returns true.
 */
export function stepThrough(
  recording: Recording,
  onStep: (target: QuickDrawRoom, before: QuickDrawState) => boolean | void,
): QuickDrawRoom {
  const target = room(recording.players, recording.seed);
  let next = 0;
  while (!target.over) {
    for (let event = recording.events[next]; event?.tick === target.tick + 1;) {
      target.input(event.playerId, event.input, event.atMs);
      event = recording.events[++next];
    }
    const before = target.state;
    target.step();
    if (onStep(target, before) === true) break;
  }
  return target;
}
