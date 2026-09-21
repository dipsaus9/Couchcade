import { createFakeRoom, createPlayers } from "@couchcade/game-sdk/testing";
import { defineGame, tickMs } from "@couchcade/game-sdk/contract";
import type { FakeRoom } from "@couchcade/game-sdk/testing";
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import meta from "../src/meta.ts";
import {
  ballId,
  init,
  inputSchema,
  matchSlotSpecs,
  onPlayerInput,
  onPlayerLeft,
  onTick,
  outcome,
  predict,
  restore,
  snapshot,
  view,
} from "../src/shared/index.ts";
import type {
  BandejaInput,
  BandejaState,
  BandejaView,
  Phase,
  RallyState,
  SlotName,
} from "../src/shared/index.ts";

/**
 * The raw rules, undressed by `withRewind`. The real game (`../src/index.ts`) wraps them so a
 * swing lands on the tick the player acted in as they saw it (CC-3.7); that wrapping is exercised
 * against `../src/index.ts` directly by `contract.test.ts` and `replay.test.ts`. Testing the raw
 * rules here keeps `state.phase`, `state.ball`, `state.scores` and so on one property away,
 * without the wrapper's `now`/`tick`/`history` layer in between.
 */
export const bareGame = defineGame({
  ...meta,
  inputSchema,
  init,
  onPlayerInput,
  onTick,
  onPlayerLeft,
  view,
  outcome,
  snapshot,
  restore,
  hostScene: () => import("../src/host/scene.ts").then((module) => module.default),
});

export type TestPlayer = ReturnType<typeof createPlayers>[number];

/** `createPlayers`, cast to a fixed-length tuple so a destructure never reads as `| undefined`. */
export function players2(): [TestPlayer, TestPlayer] {
  return createPlayers(2) as [TestPlayer, TestPlayer];
}
export function players3(): [TestPlayer, TestPlayer, TestPlayer] {
  return createPlayers(3) as [TestPlayer, TestPlayer, TestPlayer];
}
export function players4(): [TestPlayer, TestPlayer, TestPlayer, TestPlayer] {
  return createPlayers(4) as [TestPlayer, TestPlayer, TestPlayer, TestPlayer];
}

export type BandejaRoom = FakeRoom<BandejaInput, BandejaState, BandejaView>;

export function room(players: number | readonly Player[], seed = 1): BandejaRoom {
  return createFakeRoom(bareGame, { players, seed });
}

export function swingInput(point: number, speed: number, angle: number): BandejaInput {
  return { type: "swing", payload: { point, speed, angle } };
}

export const ctxAt = (atMs: number, nowMs = atMs): InputContext => ({
  atMs,
  nowMs,
  displayLagMs: 0,
});

/** Steps a fake room until `predicate(state)`, at most `maxTicks`. */
export function stepUntil(
  target: BandejaRoom,
  predicate: (state: BandejaState) => boolean,
  maxTicks = 60 * 60 * 20,
): BandejaState {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(target.state)) return target.state;
    if (target.over) break;
    target.step();
  }
  throw new Error(`Condition never met (stopped at phase ${target.state.phase})`);
}

export function stepUntilPhase(
  target: BandejaRoom,
  phase: Phase,
  maxTicks = 60 * 60 * 20,
): BandejaState {
  return stepUntil(target, (state) => state.phase === phase, maxTicks);
}

/** Ticks a bare state (no room) until `predicate(state)`. */
export function tickUntil(
  state: BandejaState,
  predicate: (state: BandejaState) => boolean,
  maxTicks = 60 * 60,
): BandejaState {
  let next = state;
  for (let i = 0; i < maxTicks && !predicate(next); i++) next = onTick(next, tickMs);
  if (!predicate(next)) throw new Error("Condition never met");
  return next;
}

/** The slot's arrival moment for the shot now in flight, or throws if it has none this leg. */
export function arriveAtFor(state: BandejaState, slot: SlotName): number {
  const arriveAt = state.ball?.leg.arrivals[slot];
  if (arriveAt === undefined) {
    throw new Error(`No arrival for ${slot} at phase ${state.phase}, point ${state.point}`);
  }
  return arriveAt;
}

/**
 * A `base` state (from `init`, optionally with its own overrides already applied) with a ball
 * already in flight mid-rally, for tests that want to drop a shot straight into a specific spot on
 * the court rather than choreograph a whole serve. `predict` runs for real, exactly as `onTick`
 * would after a live hit, so `leg.arrivals` is genuine.
 */
export function ralliedState(
  base: BandejaState,
  ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number },
  rallyOverrides: Partial<RallyState> = {},
): BandejaState {
  const leg = predict(ball, tickMs, base.nowMs, matchSlotSpecs(base));
  return {
    ...base,
    phase: "rally",
    phaseAtMs: base.nowMs,
    ball: {
      body: { id: ballId, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, a: 0, w: 0 },
      z: ball.z,
      vz: ball.vz,
      leg,
    },
    rally: { shots: 1, bounces: 0, bounceSide: null, pointSettleAtMs: null, ...rallyOverrides },
  };
}
