import { createFakeRoom, createPlayers } from "@couchcade/game-sdk/testing";
import { tickMs, tickTimeMs } from "@couchcade/game-sdk/contract";
import type { FakeRoom, Recording } from "@couchcade/game-sdk/testing";
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import game from "../src/index.ts";
import {
  aimHomeX,
  aimHomeY,
  onTick,
  pitchPx,
  roundRules,
  volleyOf,
  yawPx,
} from "../src/shared/index.ts";
import type {
  Phase,
  TargetRangeInput,
  TargetRangeState,
  TargetRangeView,
} from "../src/shared/index.ts";

export type TargetRangeRoom = FakeRoom<TargetRangeInput, TargetRangeState, TargetRangeView>;

export const shoot = (volley: number, yaw = 0, pitch = 0, power = 1): TargetRangeInput => ({
  type: "shoot",
  payload: { volley, aim: { yaw, pitch }, power },
});

export const lower = (volley: number): TargetRangeInput => ({ type: "lower", payload: { volley } });

export const aim = (yaw: number, pitch: number): TargetRangeInput => ({
  type: "aim",
  payload: { yaw, pitch },
});

export const ctxAt = (atMs: number, nowMs = atMs): InputContext => ({
  atMs,
  nowMs,
  displayLagMs: 0,
});

export function room(players: number | readonly Player[], seed = 1): TargetRangeRoom {
  return createFakeRoom(game, { players, seed });
}

/** Ticks a room until the phase is `phase` (and the volley is `volley`, when given). */
export function stepUntil(
  target: TargetRangeRoom,
  phase: Phase,
  volley?: number,
): TargetRangeState {
  for (let i = 0; i < 60 * 60 * 10; i++) {
    const { state } = target;
    if (state.phase === phase && (volley === undefined || volleyOf(state) === volley)) return state;
    if (target.over) break;
    target.step();
  }
  throw new Error(`Never reached ${phase}${volley === undefined ? "" : ` in volley ${volley}`}`);
}

/** Ticks a bare state (no room) until the phase is `phase`. */
export function tickUntil(state: TargetRangeState, phase: Phase): TargetRangeState {
  let next = state;
  for (let i = 0; i < 60 * 60 && next.phase !== phase; i++) next = onTick(next, tickMs);
  if (next.phase !== phase) throw new Error(`Never reached ${phase}`);
  return next;
}

/** The aim that lands an arrow exactly on `(x, y)` with this power, allowing for drop and wind. */
export function aimFor(state: TargetRangeState, x: number, y: number, power = 1) {
  const rules = roundRules(state.round);
  const flightMs = Math.round(rules.baseMs / (0.4 + 0.6 * power));
  const stretch = flightMs / rules.baseMs;
  const wind = state.winds[state.arrow - 1] ?? 0;
  const aimX = x - wind * rules.windPx * stretch;
  const aimY = y - rules.dropPx * stretch * stretch;
  return { yaw: (aimX - aimHomeX) / yawPx, pitch: (aimHomeY - aimY) / pitchPx };
}

/** One player's shot in a volley: when (ms after it opened), and where it aims relative to the centre. */
export interface PlannedShot {
  afterMs: number;
  /** World px from the target centre the arrow should land. */
  dx: number;
  dy: number;
  power?: number;
}

/** A shot plan: what player `slot` does in `volley`, or null for no shot. */
export type Plan = (volley: number, slot: number, state: TargetRangeState) => PlannedShot | null;

/**
 * Plays a full match with bots that know the target and the wind. Every shot arrives `delayMs`
 * after it was let go.
 */
export function playMatch(seed: number, players: number, plan: Plan, delayMs = 0): TargetRangeRoom {
  const target = room(createPlayers(players), seed);
  let plannedVolley = 0;
  let pending: Array<{ playerId: string; atMs: number; input: TargetRangeInput }> = [];

  for (let i = 0; i < 60 * 60 * 10 && !target.over; i++) {
    const { state } = target;
    if (state.phase === "open" && plannedVolley !== volleyOf(state)) {
      plannedVolley = volleyOf(state);
      pending = [];
      state.players.forEach((player, slot) => {
        const shot = plan(plannedVolley, slot, state);
        if (shot === null) return;
        const power = shot.power ?? 1;
        const { yaw, pitch } = aimFor(
          state,
          state.target.x + shot.dx,
          state.target.y + shot.dy,
          power,
        );
        pending.push({
          playerId: player.id,
          atMs: (state.openAtMs as number) + shot.afterMs,
          input: shoot(plannedVolley, clampUnit(yaw), clampUnit(pitch), power),
        });
      });
    }
    const nextNowMs = tickTimeMs(target.tick + 1);
    pending = pending.filter((entry) => {
      if (entry.atMs + delayMs > nextNowMs + 1e-6) return true;
      target.input(entry.playerId, entry.input, entry.atMs);
      return false;
    });
    target.step();
  }
  return target;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

/**
 * Plays a recording tick by tick in a new room and calls `onStep` with the state before each
 * tick. Stops when the match is over or `onStep` returns true.
 */
export function stepThrough(
  recording: Recording,
  onStep: (target: TargetRangeRoom, before: TargetRangeState) => boolean | void,
): TargetRangeRoom {
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
