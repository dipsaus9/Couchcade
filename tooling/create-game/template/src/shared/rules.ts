/**
 * __TITLE__'s rules as pure functions over plain JSON state (docs/architecture/platform.md, "The
 * contract"): first to `winningTaps` taps wins. Replace this with the game's real rules once
 * docs/games/__ID__.md exists; this is deliberately the smallest game that still exercises every
 * part of the contract, `snapshot` and `restore` included.
 */
import { createRng } from "@couchcade/utils";
import type { ControllerView, JsonValue } from "@couchcade/protocol";
import type { Outcome, Player } from "@couchcade/game-sdk/contract";
import type { __ID_PASCAL__Input } from "./input.ts";

/** Taps needed to win. */
export const winningTaps = 5;

export interface __ID_PASCAL__State {
  /** Tap count by player id, in `init` order. */
  taps: Record<string, number>;
  /** The first player to reach `winningTaps`, or null while the match runs. */
  winnerId: string | null;
  /** Seeded RNG state (`createRng(seed).state`). Unused by these rules; kept as the pattern every
   * game's state follows (docs/architecture/platform.md, contract rule 3). */
  rng: number;
}

export type __ID_PASCAL__View = {
  /** This player's own tap count. */
  yours: number;
  target: number;
  winnerId: string | null;
};

/** A new match: every seated player starts at 0 taps. */
export function init(players: readonly Player[], seed: number): __ID_PASCAL__State {
  return {
    taps: Object.fromEntries(players.map((player) => [player.id, 0])),
    winnerId: null,
    rng: createRng(seed).state,
  };
}

/** A tap counts once the match is decided; the winner is whoever reaches the target first. */
export function onPlayerInput(
  state: __ID_PASCAL__State,
  player: Player,
  _input: __ID_PASCAL__Input,
): __ID_PASCAL__State {
  if (state.winnerId !== null || !(player.id in state.taps)) return state;
  const taps = { ...state.taps, [player.id]: (state.taps[player.id] ?? 0) + 1 };
  const winnerId = (taps[player.id] ?? 0) >= winningTaps ? player.id : null;
  return { ...state, taps, winnerId };
}

/** Every player sees everyone's progress and, once decided, who won. */
export function view(
  state: __ID_PASCAL__State,
  player: Player,
): ControllerView & { data: __ID_PASCAL__View } {
  return {
    screen: "__ID__-tap",
    data: { yours: state.taps[player.id] ?? 0, target: winningTaps, winnerId: state.winnerId },
  };
}

/** Placed by tap count, most taps first; ties share a place. `null` while the match runs. */
export function outcome(state: __ID_PASCAL__State): Outcome | null {
  if (state.winnerId === null) return null;
  const scores = Object.entries(state.taps);
  return {
    placements: scores.map(([playerId, score]) => ({
      playerId,
      place: 1 + scores.filter(([, other]) => other > score).length,
      score,
    })),
  };
}

/** Tap counts and the winner, well under the 600-byte game budget (session-flow.md). */
export function snapshot(state: __ID_PASCAL__State): JsonValue {
  return { taps: state.taps, winnerId: state.winnerId };
}

/** Resumes with as many saved tap counts as match the seated players; unknown data starts fresh. */
export function restore(
  players: readonly Player[],
  seed: number,
  data: JsonValue,
): __ID_PASCAL__State {
  const fresh = init(players, seed);
  if (typeof data !== "object" || data === null || Array.isArray(data)) return fresh;
  const saved = data as { taps?: unknown; winnerId?: unknown };
  if (typeof saved.taps !== "object" || saved.taps === null) return fresh;
  const savedTaps = saved.taps as Record<string, unknown>;
  const taps = Object.fromEntries(
    players.map((player) => {
      const value = savedTaps[player.id];
      return [player.id, typeof value === "number" ? value : 0];
    }),
  );
  const winnerId =
    typeof saved.winnerId === "string" && players.some((player) => player.id === saved.winnerId)
      ? saved.winnerId
      : null;
  return { ...fresh, taps, winnerId };
}
