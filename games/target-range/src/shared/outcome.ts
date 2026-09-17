import type { Outcome } from "@couchcade/game-sdk/contract";
import type { TargetRangePlayer, TargetRangeState } from "./state.ts";

/** Negative when `a` places ahead of `b`: more points, then more bullseyes. */
export function compare(a: TargetRangePlayer, b: TargetRangePlayer): number {
  return b.points - a.points || b.tens - a.tens;
}

/**
 * Placements once the match is over, null while it runs. Players who left are placed with the
 * points they kept. Players still tied share a place, and `score` is the points total out of 120.
 */
export function outcome(state: TargetRangeState): Outcome | null {
  if (state.phase !== "over") return null;
  return {
    placements: state.players.toSorted(compare).map((player) => ({
      playerId: player.id,
      place: 1 + state.players.filter((other) => compare(other, player) < 0).length,
      score: player.points,
    })),
  };
}
