import { createFakeRoom } from "@couchcade/game-sdk/testing";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { FakeRoom } from "@couchcade/game-sdk/testing";
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import game from "../src/index.ts";
import { onTick } from "../src/shared/index.ts";
import type {
  Phase,
  StrikeNightInput,
  StrikeNightState,
  StrikeNightView,
} from "../src/shared/index.ts";

export type StrikeNightRoom = FakeRoom<StrikeNightInput, StrikeNightState, StrikeNightView>;

/**
 * Throw parameters calibrated against the rules in this story, `@couchcade/physics` on the
 * kickback walls in constants.ts: x=0.2/speed=0.8/angle=0/spin=0 is a right-pocket strike, a
 * straight ball down the middle (x=0) leaves 7 pins, x=-0.3 leaves a single centre pin (p2-1) for
 * a clean spare look, and x=1/speed=0.3/spin=1 drifts into the gutter before the pins.
 */
export const strikeThrow = { x: 0.2, speed: 0.8, angle: 0, spin: 0 } as const;
export const openThrow = { x: 0, speed: 0.8, angle: 0, spin: 0 } as const;
export const spareSetupThrow = { x: -0.3, speed: 0.8, angle: 0, spin: 0 } as const;
export const spareFinishThrow = { x: 0, speed: 0.8, angle: 0, spin: 0 } as const;
export const gutterThrow = { x: 1, speed: 0.3, angle: 0, spin: 1 } as const;

export function room(players: number | readonly Player[], seed = 1): StrikeNightRoom {
  return createFakeRoom(game, { players, seed });
}

export const ctxAt = (atMs: number, nowMs = atMs): InputContext => ({
  atMs,
  nowMs,
  displayLagMs: 0,
});

export function bowlInput(
  turn: number,
  throwParams: { x: number; speed: number; angle: number; spin: number },
): StrikeNightInput {
  return { type: "bowl", payload: { turn, ...throwParams } };
}

/** Steps a fake room until the state's phase is `phase`, at most `maxTicks`. */
export function stepUntil(
  target: StrikeNightRoom,
  phase: Phase,
  maxTicks = 60 * 60 * 20,
): StrikeNightState {
  for (let i = 0; i < maxTicks; i++) {
    if (target.state.phase === phase) return target.state;
    if (target.over) break;
    target.step();
  }
  throw new Error(`Never reached ${phase} (stopped at ${target.state.phase})`);
}

/** Ticks a bare state (no room) until `phase`. */
export function tickUntil(
  state: StrikeNightState,
  phase: Phase,
  maxTicks = 60 * 60,
): StrikeNightState {
  let next = state;
  for (let i = 0; i < maxTicks && next.phase !== phase; i++) next = onTick(next, tickMs);
  if (next.phase !== phase) throw new Error(`Never reached ${phase}`);
  return next;
}

/** The current bowler throws at once, from the room's live state and turn. */
export function bowlNow(
  target: StrikeNightRoom,
  throwParams: { x: number; speed: number; angle: number; spin: number },
): void {
  const bowlerId = target.state.bowlerId as string;
  target.input(bowlerId, bowlInput(target.state.turn, throwParams), target.nowMs);
}

/** Reaches `lineup` (if not there already), bowls, then ticks to `result`: one full roll, scored. */
export function bowlAndSettle(
  target: StrikeNightRoom,
  throwParams: { x: number; speed: number; angle: number; spin: number },
): StrikeNightState {
  if (target.state.phase !== "lineup") stepUntil(target, "lineup");
  bowlNow(target, throwParams);
  return stepUntil(target, "result");
}

/** Reaches `lineup` for frame 1's first roll from a fresh room. */
export function reachFirstLineup(target: StrikeNightRoom): StrikeNightState {
  return stepUntil(target, "lineup");
}
