import { createRng } from "@couchcade/utils";
import type { Player } from "@couchcade/game-sdk/contract";
import type { BodyState } from "@couchcade/physics";
import { frameCount, pinSpots } from "./constants.ts";

/**
 * Turn flow (docs/games/strike-night.md, "Turn flow and timings"): `intro` -> `lineup` ->
 * `rolling` -> `result` -> `lineup` (roll 2, or the next bowler) or `frameEnd` (the frame's last
 * bowler finished) -> `lineup` (frames left) or `over` (outcome returns placements).
 */
export type Phase = "intro" | "lineup" | "rolling" | "result" | "frameEnd" | "over";

/** How a roll came out: strike (roll 1, all 10), spare (roll 2 clears the rest), open or gutter. */
export type RollMark = "strike" | "spare" | "open" | "gutter";

/**
 * A bowler's last roll, shown on their phone and the TV until their next one. A `type`, not an
 * `interface`: it sits inside `StrikeNightView`, which must structurally satisfy `JsonValue`.
 */
export type RollResult = {
  /** Pins knocked down by that roll. */
  pins: number;
  mark: RollMark;
  /** The turn timer rolled it. */
  auto: boolean;
  /** The frame score, once the frame that roll belonged to is over. Otherwise null. */
  frame: number | null;
};

/** One frame's two rolls and its score once it's over (current-frame scoring, owner decision 1). */
export interface FrameRecord {
  roll1: number | null;
  roll2: number | null;
  /** Final the moment the frame ends: a strike is 30, a spare 10 + roll1, else roll1 + roll2. */
  score: number | null;
}

/** A pin still in the current roll's simulation, or one that already left the world (the pit). */
export interface PinRuntime {
  id: string;
  spotX: number;
  spotY: number;
  body: BodyState | null;
  /** Once true (speed passed 0.5 m/s), stays true for the rest of the roll. */
  fell: boolean;
}

/** The ball and pins mid-roll: onTick steps this with `@couchcade/physics` during `rolling`. */
export interface ActiveRoll {
  bowlerId: string;
  frame: number;
  roll: 1 | 2;
  turn: number;
  /** The turn timer rolled this one: the bowler's position, speed 0.3, angle 0, spin 0. */
  auto: boolean;
  /** The swing's spin, applied as a hook push every tick past `hookFromY`. */
  spin: number;
  releaseAtMs: number;
  /** Null once the ball left the world: a gutter (can't touch a pin) or the pit. */
  ball: BodyState | null;
  gutter: boolean;
  /** Set once a gutter is detected: when `rolling` ends, as if it kept rolling to the pit. */
  gutterEndAtMs: number | null;
  /** Set the first tick the ball reaches `gutterBeforeY`, for the 2,500 ms settle timer. */
  reachedPinsAtMs: number | null;
  pins: PinRuntime[];
}

export interface StrikeNightPlayer {
  id: string;
  name: string;
  /** Position in `init`'s players array: turn order and the scorecard's seat order. */
  seat: number;
  /** The seat expired (`onPlayerLeft`): points are kept, no more frames. */
  left: boolean;
  /** This player's last lineup position, −1 to 1. Starts at 0. */
  x: number;
  /** The Pip holds the ball up (`grip` with `held: true`). TV-only; never sent to phones. */
  gripped: boolean;
  /** This player's last roll, null before it. */
  last: RollResult | null;
  /** This player's last 2 rolls' `auto` flags, oldest first. Away when both are true. */
  recentAuto: boolean[];
  /** In `init` order, length `frameCount`. */
  frames: FrameRecord[];
  total: number;
  strikes: number;
  spares: number;
}

/**
 * What `snapshot` stores at each `frameEnd` (docs/games/strike-night.md, "Edge cases"). A `type`,
 * not an `interface`, so it structurally satisfies `snapshot`'s `JsonValue` return type.
 */
export type StrikeNightSnapshot = {
  /** The frame to resume at. */
  f: number;
  pts: Record<string, number>;
  st: Record<string, number>;
  sp: Record<string, number>;
  /** Completed frame scores, in frame order, so a restored scorecard can still show them. */
  fr: Record<string, number[]>;
};

export interface StrikeNightState {
  phase: Phase;
  /** Game time of the latest tick. */
  nowMs: number;
  /** Game time the current phase started. */
  phaseAtMs: number;
  /** 1 to `frameCount`. */
  frame: number;
  /** Counts every roll from 1 for the whole match, echoed by `move`, `grip` and `bowl`. */
  turn: number;
  /** 1 or 2: the roll of `frame` now up (or, in `result`/`frameEnd`, just finished). */
  roll: 1 | 2;
  /** The player up to bowl (or who just bowled, during `result`). Null only before `intro` ends. */
  bowlerId: string | null;
  /** This lineup's deadline; a `bowl` counts if `ctx.atMs` is at or before it. Null outside `lineup`. */
  deadlineMs: number | null;
  /** True if the bowler was away when this lineup started (turn flow, rule 7). */
  awayAtLineupStart: boolean;
  /** Ids of the pins standing for the roll now up: all 10 on roll 1, the roll 1 survivors on roll 2. */
  standingPins: string[];
  players: StrikeNightPlayer[];
  /** Set during `rolling`, null otherwise. */
  activeRoll: ActiveRoll | null;
  /** Seeded RNG state. Unused: Strike Night has no randomness (rule 11), kept as the pattern every
   * game's state follows (`@couchcade/game-sdk/contract`, contract rule 3). */
  rng: number;
  /** The snapshot as of the start of `frame`, frozen until the next frame starts. */
  frameStart: StrikeNightSnapshot;
}

/** Players who still play: their seat hasn't expired. */
export function activePlayers(state: StrikeNightState): StrikeNightPlayer[] {
  return state.players.filter((player) => !player.left);
}

/** Active players' seat numbers, ascending. */
export function activeSeats(state: StrikeNightState): number[] {
  return activePlayers(state)
    .map((player) => player.seat)
    .toSorted((a, b) => a - b);
}

export function findPlayer(
  state: StrikeNightState,
  id: string | null,
): StrikeNightPlayer | undefined {
  return id === null ? undefined : state.players.find((player) => player.id === id);
}

export function findPlayerBySeat(
  state: StrikeNightState,
  seat: number,
): StrikeNightPlayer | undefined {
  return state.players.find((player) => player.seat === seat);
}

/** All 10 pin ids, in `pinSpots` order. */
export const allPinIds: readonly string[] = pinSpots.map((spot) => spot.id);

/** A frame is done once it has a strike on roll 1, or a roll 2. */
export function frameComplete(frame: FrameRecord): boolean {
  return frame.roll1 === 10 || frame.roll2 !== null;
}

/** The score of a completed frame: a strike is 30, a spare 10 + roll1, else roll1 + roll2. */
export function scoreFrame(frame: FrameRecord): number | null {
  if (frame.roll1 === null) return null;
  if (frame.roll1 === 10) return 30;
  if (frame.roll2 === null) return null;
  return frame.roll1 + frame.roll2 === 10 ? 10 + frame.roll1 : frame.roll1 + frame.roll2;
}

/**
 * A completed frame's mark, from its score alone: a strike is always exactly 30, a spare 10 to
 * 19 (an open frame can score at most 9), the rest open. Works for a frame restored from
 * `snapshot`, which keeps only the score.
 */
export function markFromScore(score: number | null): "strike" | "spare" | "open" | null {
  if (score === null) return null;
  if (score >= 20) return "strike";
  return score >= 10 ? "spare" : "open";
}

/** The snapshot of the scores right now, with `frame` to resume at. */
export function scoresSnapshot(state: StrikeNightState, frame: number): StrikeNightSnapshot {
  return {
    f: frame,
    pts: Object.fromEntries(state.players.map((player) => [player.id, player.total])),
    st: Object.fromEntries(state.players.map((player) => [player.id, player.strikes])),
    sp: Object.fromEntries(state.players.map((player) => [player.id, player.spares])),
    fr: Object.fromEntries(
      state.players.map((player) => [
        player.id,
        player.frames.map((f) => f.score).filter((score): score is number => score !== null),
      ]),
    ),
  };
}

/** A new match: `intro` starts at game time 0, frame 1, the first seated player up. */
export function init(players: readonly Player[], seed: number): StrikeNightState {
  const strikeNightPlayers: StrikeNightPlayer[] = players.map((player, seat) => ({
    id: player.id,
    name: player.name,
    seat,
    left: false,
    x: 0,
    gripped: false,
    last: null,
    recentAuto: [],
    frames: Array.from({ length: frameCount }, () => ({ roll1: null, roll2: null, score: null })),
    total: 0,
    strikes: 0,
    spares: 0,
  }));
  const state: StrikeNightState = {
    phase: "intro",
    nowMs: 0,
    phaseAtMs: 0,
    frame: 1,
    turn: 1,
    roll: 1,
    bowlerId: strikeNightPlayers[0]?.id ?? null,
    deadlineMs: null,
    awayAtLineupStart: false,
    standingPins: [...allPinIds],
    players: strikeNightPlayers,
    activeRoll: null,
    rng: createRng(seed).state,
    frameStart: { f: 1, pts: {}, st: {}, sp: {}, fr: {} },
  };
  return { ...state, frameStart: scoresSnapshot(state, 1) };
}
