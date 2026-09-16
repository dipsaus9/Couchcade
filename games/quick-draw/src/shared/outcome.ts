import type { Outcome } from "@couchcade/game-sdk/contract";
import type { QuickDrawPlayer, QuickDrawState } from "./state.ts";

/** Negative when `a` places ahead of `b`: more points, then the fastest valid reaction. */
function compare(a: QuickDrawPlayer, b: QuickDrawPlayer): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.bestMs === b.bestMs) return 0;
  if (a.bestMs === null || b.bestMs === null) return a.bestMs === null ? 1 : -1;
  return a.bestMs - b.bestMs;
}

/**
 * Placements once the match is over, null while it runs. Players who left are placed with the
 * points they kept. Players still tied share a place, and `score` is the points total.
 */
export function outcome(state: QuickDrawState): Outcome | null {
  if (state.phase !== "over") return null;
  return {
    placements: state.players.toSorted(compare).map((player) => ({
      playerId: player.id,
      place: 1 + state.players.filter((other) => compare(other, player) < 0).length,
      score: player.points,
    })),
  };
}
