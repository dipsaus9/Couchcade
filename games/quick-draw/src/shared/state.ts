import { createRng } from "@couchcade/utils";
import type { Player } from "@couchcade/game-sdk/contract";

/**
 * Round flow: `intro` → `standoff` → `draw` → `result`, then the next `intro` or `over`.
 * `over` means `outcome` returns placements.
 */
export type Phase = "intro" | "standoff" | "draw" | "result" | "over";

/**
 * A player's result in one round. `valid` is 100 to 1,500 ms after DRAW!. `foul` is anything
 * earlier, and `fooled` is a foul within 1,000 ms after a fake. `slow` is over 1,500 ms, or no tap
 * when the round resolved.
 */
export type TapKind = "valid" | "foul" | "fooled" | "slow";

export interface TapResult {
  kind: TapKind;
  /** Reaction time in whole ms after DRAW!, for `valid` and a late `slow` tap. Otherwise null. */
  ms: number | null;
  /** Game time of the tap, null when the player never tapped. */
  atMs: number | null;
}

export interface QuickDrawPlayer {
  id: string;
  /** Shown as the round winner on other phones. */
  name: string;
  points: number;
  /** Fastest valid reaction this match, the placement tie-break. */
  bestMs: number | null;
  /** The seat expired: points are kept, but the player can't score again. */
  left: boolean;
  /** This round's result, kept through the next `intro` so the phone keeps showing it. */
  result: TapResult | null;
}

export type FakeKind = "word" | "crow" | "glint";

export interface Fake {
  /** Game time the TV shows the fake. */
  atMs: number;
  kind: FakeKind;
  /** The look-alike word for `word`, otherwise null. */
  word: string | null;
  /** Whose popgun glints for `glint`, otherwise null. */
  playerId: string | null;
}

export interface QuickDrawState {
  phase: Phase;
  /** 1 to 9. */
  round: number;
  /** Game time of the latest tick. */
  nowMs: number;
  /** Game time the current phase started. */
  phaseAtMs: number;
  /** When this round's DRAW! is due, rolled at the start of the standoff. */
  drawDueMs: number | null;
  /** Game time of the tick that first showed DRAW!. Taps are judged against it. */
  drawAtMs: number | null;
  /** This round's fakes, in time order. */
  fakes: Fake[];
  /** In `init` order. */
  players: QuickDrawPlayer[];
  /** Ids of the players who scored this round. Several on an exact tie, none without a valid tap. */
  winners: string[];
  /** Seeded RNG state (`createRng(rng)`), drawn from when a standoff starts. */
  rng: number;
  /** Seeds the order fake words are shown in, so a word only repeats after all six were shown. */
  wordSeed: number;
  /** Fake words shown so far this match. */
  wordsShown: number;
  /** `rng` and `wordsShown` before this round's standoff was rolled, for `snapshot`. */
  roundStart: { rng: number; wordsShown: number };
}

/** A new match: round 1's intro starts at game time 0. */
export function init(players: readonly Player[], seed: number): QuickDrawState {
  const rng = createRng(seed).state;
  return {
    phase: "intro",
    round: 1,
    nowMs: 0,
    phaseAtMs: 0,
    drawDueMs: null,
    drawAtMs: null,
    fakes: [],
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      points: 0,
      bestMs: null,
      left: false,
      result: null,
    })),
    winners: [],
    rng,
    wordSeed: rng,
    wordsShown: 0,
    roundStart: { rng, wordsShown: 0 },
  };
}

/** Players who still play: their seat hasn't expired. */
export function activePlayers(state: QuickDrawState): QuickDrawPlayer[] {
  return state.players.filter((player) => !player.left);
}

export function findPlayer(state: QuickDrawState, id: string): QuickDrawPlayer | undefined {
  return state.players.find((player) => player.id === id);
}
