import { createRng } from "@couchcade/utils";
import type { Rng } from "@couchcade/utils";
import type { Player } from "@couchcade/game-sdk/contract";
import type { Aim, AimTrack } from "@couchcade/game-sdk/input";
import {
  aimHomeX,
  aimHomeY,
  arrowsPerRound,
  rounds,
  stillShotClearancePx,
  targetMaxX,
  targetMaxY,
  targetMinX,
  targetMinY,
  targetStepPx,
} from "./constants.ts";
import type { RoundRules } from "./constants.ts";
import type { Point } from "./flight.ts";

/**
 * Round flow: `intro` → `open` → `landing` → `reveal`, then the next arrow's `open` or, after
 * arrow 3, `roundEnd` → the next round's `intro` or `over`. `over` means `outcome` returns
 * placements.
 */
export type Phase = "intro" | "open" | "landing" | "reveal" | "roundEnd" | "over";

/**
 * A player's result in one volley: the arrow's points (0 is a miss), `late` for a shot let go
 * after the volley closed, `none` when the player didn't shoot.
 */
export type VolleyResult = number | "late" | "none";

/** An arrow that flies: shot in time. It stays in the target until the round ends. */
export interface Arrow {
  playerId: string;
  /** 1 to 12. */
  volley: number;
  /** Game time the player let go. */
  atMs: number;
  /** The aim at release and the draw power, as the phone sent them. */
  aim: Aim;
  power: number;
  /** Landing point in world px, rounded to 0.1 px. */
  x: number;
  y: number;
  flightMs: number;
  /** `atMs + flightMs`. */
  landsAtMs: number;
  points: number;
  /** True from the first tick at or after `landsAtMs`. */
  landed: boolean;
}

export interface TargetRangePlayer {
  id: string;
  name: string;
  /** Points revealed so far, out of 120. */
  points: number;
  /** Bullseyes revealed so far, the placement tie-break. */
  tens: number;
  /** The seat expired: points are kept, but the player shoots no more arrows. */
  left: boolean;
  /** True while the TV shows this player's crosshair: from the first aim sample until a shot, `lower` or the close. */
  aiming: boolean;
  /** This volley's aim samples for the crosshair (`aimAt` on the TV). Empty when not aiming. */
  aim: AimTrack;
  /** This volley's result once the player shot, `none` from the reveal on, null before. */
  result: VolleyResult | null;
  /** The last revealed volley's result, null before the first reveal. */
  last: VolleyResult | null;
}

/** What `snapshot` stores: the round to play, points and bullseyes by player id, and the RNG. */
export type TargetRangeSnapshot = {
  r: number;
  pts: Record<string, number>;
  tens: Record<string, number>;
  rng: number;
};

export interface TargetRangeState {
  phase: Phase;
  /** 1 to 4. */
  round: number;
  /** 1 to 3, the arrow of the round that is open, or was shot last. */
  arrow: number;
  /** Game time of the latest tick. */
  nowMs: number;
  /** Game time the current phase started. */
  phaseAtMs: number;
  /** This round's target centre, in whole world px. */
  target: Point;
  /** The wind for each arrow of this round, signed (right is positive). */
  winds: number[];
  /** Game time the current volley opened, null before the round's first volley. */
  openAtMs: number | null;
  /** Game time the current volley closed, null while it is open. Shots after it are `late`. */
  closeAtMs: number | null;
  /** The volley closed because its 10 seconds ran out, so `landing` waits for late messages. */
  timedOut: boolean;
  /** Arrows shot this round, in the order they were applied. */
  arrows: Arrow[];
  /** In `init` order. */
  players: TargetRangePlayer[];
  /** Seeded RNG state (`createRng(rng)`), drawn from when a round starts. */
  rng: number;
  /** The snapshot of this round's start, before its target and winds were rolled. */
  roundStart: TargetRangeSnapshot;
}

/** The rules of `round` (1 to 4). */
export function roundRules(round: number): RoundRules {
  return rounds[Math.min(rounds.length, Math.max(1, round)) - 1] as RoundRules;
}

/** 1 to 12: the volley number phones echo in `shoot` and `lower`. */
export function volleyOf(state: Pick<TargetRangeState, "round" | "arrow">): number {
  return (state.round - 1) * arrowsPerRound + state.arrow;
}

/** The wind of the open (or last shot) arrow. */
export function currentWind(state: Pick<TargetRangeState, "winds" | "arrow">): number {
  return state.winds[state.arrow - 1] ?? 0;
}

/** Players who still play: their seat hasn't expired. */
export function activePlayers(state: TargetRangeState): TargetRangePlayer[] {
  return state.players.filter((player) => !player.left);
}

export function findPlayer(state: TargetRangeState, id: string): TargetRangePlayer | undefined {
  return state.players.find((player) => player.id === id);
}

/**
 * A target centre for `round`: `x` 160 to 320 and `y` 110 to 160 in steps of 2 px, rolled again
 * while it lies within 6 px of where a still phone lands at full draw, `(240, 140 + drop)`.
 */
export function rollTarget(rng: Rng, round: RoundRules): Point {
  const stillY = aimHomeY + round.dropPx;
  for (;;) {
    const x = targetMinX + targetStepPx * rng.int(0, (targetMaxX - targetMinX) / targetStepPx);
    const y = targetMinY + targetStepPx * rng.int(0, (targetMaxY - targetMinY) / targetStepPx);
    const dx = x - aimHomeX;
    const dy = y - stillY;
    if (dx * dx + dy * dy > stillShotClearancePx * stillShotClearancePx) return { x, y };
  }
}

/** A wind strength in the round's range and, when it isn't 0, a direction. */
export function rollWind(rng: Rng, round: RoundRules): number {
  const strength = rng.int(round.windMin, round.windMax);
  if (strength === 0) return 0;
  return rng.int(0, 1) === 0 ? -strength : strength;
}

/** The snapshot of the scores right now, with the round to play and the RNG to play it with. */
export function scoresSnapshot(
  state: TargetRangeState,
  r: number,
  rng: number,
): TargetRangeSnapshot {
  return {
    r,
    pts: Object.fromEntries(state.players.map((player) => [player.id, player.points])),
    tens: Object.fromEntries(state.players.map((player) => [player.id, player.tens])),
    rng,
  };
}

/**
 * Starts `round`'s intro at `state.nowMs`: rolls the target and the three winds from the seeded
 * RNG and clears the previous round's arrows. Scores and each player's last result stay.
 */
export function startRound(state: TargetRangeState, round: number): TargetRangeState {
  const rules = roundRules(round);
  const rng = createRng(state.rng);
  const target = rollTarget(rng, rules);
  const winds = Array.from({ length: arrowsPerRound }, () => rollWind(rng, rules));
  return {
    ...state,
    phase: "intro",
    round,
    arrow: 1,
    phaseAtMs: state.nowMs,
    target,
    winds,
    openAtMs: null,
    closeAtMs: null,
    timedOut: false,
    arrows: [],
    players: state.players.map((player) => ({ ...player, aiming: false, aim: [], result: null })),
    rng: rng.state,
    roundStart: scoresSnapshot(state, round, state.rng),
  };
}

/** A new match: round 1's intro starts at game time 0. */
export function init(players: readonly Player[], seed: number): TargetRangeState {
  const empty: TargetRangeState = {
    phase: "intro",
    round: 1,
    arrow: 1,
    nowMs: 0,
    phaseAtMs: 0,
    target: { x: aimHomeX, y: aimHomeY },
    winds: [],
    openAtMs: null,
    closeAtMs: null,
    timedOut: false,
    arrows: [],
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      points: 0,
      tens: 0,
      left: false,
      aiming: false,
      aim: [],
      result: null,
      last: null,
    })),
    rng: createRng(seed).state,
    roundStart: { r: 1, pts: {}, tens: {}, rng: 0 },
  };
  return startRound(empty, 1);
}
