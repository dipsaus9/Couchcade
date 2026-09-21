import { createRng } from "@couchcade/utils";
import type { Player } from "@couchcade/game-sdk/contract";
import type { SampleTrack } from "@couchcade/game-sdk/input";
import type { BodyState } from "@couchcade/physics";
import { holeCount } from "./constants.ts";
import type { Spot } from "./hole.ts";

/**
 * Stroke flow (docs/games/putt-club.md, "Stroke flow and timings"): `intro` -> `holeIntro` ->
 * `turn` -> `rolling` -> `result` -> `turn` (players left on this hole) or `holeEnd` (everyone
 * holed out or reached the cap) -> `holeIntro` (holes left) or `over` (outcome returns placements).
 */
export type Phase = "intro" | "holeIntro" | "turn" | "rolling" | "result" | "holeEnd" | "over";

/** How a stroke came out (rule 8, rule 9). */
export type StrokeOutcome = "rolled" | "holed" | "penalty" | "capped";

/**
 * A player's last stroke, shown on their phone and the TV until their next one. A `type`, not an
 * `interface`: it sits inside `PuttClubView`, which must structurally satisfy `JsonValue`.
 */
export type LastStroke = {
  result: StrokeOutcome;
  /** This player's strokes on this hole after that stroke. */
  strokes: number;
  /** The hole's final score, once they finished it on that stroke. Otherwise null. */
  hole: number | null;
  /** The turn timer putted for them. */
  auto: boolean;
};

export interface PuttClubPlayer {
  id: string;
  name: string;
  /** Position in `init`'s players array: turn order and the scorecard's seat order. */
  seat: number;
  /** The seat expired (`onPlayerLeft`): scores are kept, no more turns. */
  left: boolean;
  /**
   * This player's ball, resting on the green. Only the current putter's ball is a physics body,
   * during `rolling`; everyone else's is drawn from this spot as a ghost (owner decision 5).
   */
  ball: Spot;
  /** True once this player has holed out or been picked up on the current hole. */
  doneHole: boolean;
  /** Strokes played on the current hole, 0 to `strokeCap`. */
  strokes: number;
  /** This player's score per hole, 1-indexed by hole number; null until they finish it. */
  scores: Array<number | null>;
  /** Sum of finished-hole scores. */
  total: number;
  /** This player's last stroke, null before it. */
  last: LastStroke | null;
  /** This player's last `awayAfterAutoPutts` strokes' `auto` flags, oldest first. Away when every
   * one of them is true. */
  recentAuto: boolean[];
}

/** The ball mid-roll: `onTick` steps this with `@couchcade/physics` during `rolling`. */
export interface ActiveStroke {
  playerId: string;
  hole: number;
  /** This player's stroke number on this hole, 1 to `strokeCap`. */
  strokeNumber: number;
  /** The match-wide turn counter this stroke belongs to (the input schema's `turn`). */
  turn: number;
  /** The turn timer putted this one. */
  auto: boolean;
  strikeAtMs: number;
  ball: BodyState;
  /** Positions the ball has held in play this stroke, oldest first, at most `PATH_MAX_POINTS`
   * (rule 8): "dropped at the end of every stroke and never enters the snapshot". */
  path: Spot[];
  /** True from the first step the ball entered `hole.captureRadius`, cleared once it leaves the
   * radius again: guards a lip-out's speed loss from reapplying every step of the same pass. */
  overCup: boolean;
  /** Set the moment the ball holes out or leaves play (a hazard or out of bounds). Once set,
   * `rolling` ends this tick regardless of the ball's speed (rule 8's edge case). */
  outcome: "holed" | "offPlay" | null;
}

/**
 * What `snapshot` stores at each `holeEnd` (docs/games/putt-club.md, "Edge cases", "TV refresh or
 * deploy mid-hole"). No positions: `restore` starts the resumed hole with every ball on the tee.
 */
export type PuttClubSnapshot = {
  /** The hole to resume at. */
  h: number;
  /** Total strokes so far, by player id (finished holes only). */
  str: Record<string, number>;
  /** Each player's finished-hole scores, in hole order. */
  sc: Record<string, number[]>;
};

export interface PuttClubState {
  phase: Phase;
  /** Game time of the latest tick. */
  nowMs: number;
  /** Game time the current phase started. */
  phaseAtMs: number;
  /** 1 to `holeCount`. */
  hole: number;
  /** Counts every stroke from 1 for the whole match, echoed by `line` and `putt`. */
  turn: number;
  /** The player putting now (or who just putted, during `result`). Null only before `intro` ends. */
  putterId: string | null;
  /** This turn's deadline; a `putt` counts if `ctx.atMs` is at or before it. Null outside `turn`. */
  deadlineMs: number | null;
  /** True if the putter was away when this turn started (rule 6). */
  awayAtTurnStart: boolean;
  /** This turn's aim samples, replayed by the TV's line (CC-13.4, host-only). Cleared each turn. */
  aim: SampleTrack<[number, number]>;
  /** The line is locked: `aim` stops accumulating, and a `putt` is expected next. */
  locked: boolean;
  players: PuttClubPlayer[];
  /** Set during `rolling`, null otherwise. */
  activeStroke: ActiveStroke | null;
  /** Seeded RNG state. Unused: Putt Club has no randomness (rule 15), kept as the pattern every
   * game's state follows (`@couchcade/game-sdk/contract`, contract rule 3). */
  rng: number;
  /** The snapshot as of the start of `hole`, frozen until the next hole starts. */
  holeStart: PuttClubSnapshot;
}

/** Players who still play: their seat hasn't expired. */
export function activePlayers(state: PuttClubState): PuttClubPlayer[] {
  return state.players.filter((player) => !player.left);
}

/** Active players' seat numbers, ascending. */
export function activeSeats(state: PuttClubState): number[] {
  return activePlayers(state)
    .map((player) => player.seat)
    .toSorted((a, b) => a - b);
}

/** Active players still playing the current hole: not left, and not `doneHole` yet. */
export function seatsInPlay(state: PuttClubState): number[] {
  return activePlayers(state)
    .filter((player) => !player.doneHole)
    .map((player) => player.seat)
    .toSorted((a, b) => a - b);
}

export function findPlayer(state: PuttClubState, id: string | null): PuttClubPlayer | undefined {
  return id === null ? undefined : state.players.find((player) => player.id === id);
}

export function findPlayerBySeat(state: PuttClubState, seat: number): PuttClubPlayer | undefined {
  return state.players.find((player) => player.seat === seat);
}

/** Hole `h` (1-based) starts with this seat, so the honour rotates (rule 3). */
export function honourSeat(hole: number, playerCount: number): number {
  if (playerCount <= 0) return 0;
  return (hole - 1) % playerCount;
}

/** The first of `seats` at or after `target`, wrapping to the smallest. Empty `seats` -> undefined. */
export function seatAtOrAfter(seats: readonly number[], target: number): number | undefined {
  return seats.find((seat) => seat >= target) ?? seats[0];
}

/** The first of `seats` strictly after `afterSeat`, wrapping to the smallest. Empty `seats` -> undefined. */
export function seatAfter(seats: readonly number[], afterSeat: number): number | undefined {
  return seats.find((seat) => seat > afterSeat) ?? seats[0];
}

/** The snapshot of the scores right now, with `hole` to resume at. */
export function scoresSnapshot(state: PuttClubState, hole: number): PuttClubSnapshot {
  return {
    h: hole,
    str: Object.fromEntries(state.players.map((player) => [player.id, player.total])),
    sc: Object.fromEntries(
      state.players.map((player) => [
        player.id,
        player.scores.filter((score): score is number => score !== null),
      ]),
    ),
  };
}

/** A new match: `intro` starts at game time 0, hole 1, no ball has a tee spot yet ([0, 0]). */
export function init(players: readonly Player[], seed: number): PuttClubState {
  const puttClubPlayers: PuttClubPlayer[] = players.map((player, seat) => ({
    id: player.id,
    name: player.name,
    seat,
    left: false,
    ball: [0, 0],
    doneHole: false,
    strokes: 0,
    scores: Array.from({ length: holeCount }, () => null),
    total: 0,
    last: null,
    recentAuto: [],
  }));
  const state: PuttClubState = {
    phase: "intro",
    nowMs: 0,
    phaseAtMs: 0,
    hole: 1,
    turn: 1,
    putterId: puttClubPlayers[honourSeat(1, puttClubPlayers.length)]?.id ?? null,
    deadlineMs: null,
    awayAtTurnStart: false,
    aim: [],
    locked: false,
    players: puttClubPlayers,
    activeStroke: null,
    rng: createRng(seed).state,
    holeStart: { h: 1, str: {}, sc: {} },
  };
  return { ...state, holeStart: scoresSnapshot(state, 1) };
}
