import type { Outcome } from "@couchcade/game-sdk/contract";
import type { StrikeNightPlayer, StrikeNightState } from "./state.ts";

/** Negative when `a` places ahead of `b`: more points, then more strikes, then more spares
 * (docs/games/strike-night.md, "Placements"). */
export function compare(a: StrikeNightPlayer, b: StrikeNightPlayer): number {
  return b.total - a.total || b.strikes - a.strikes || b.spares - a.spares;
}

/**
 * Placements once the match is over, null while it runs. Players who left are placed with the
 * points they kept. Players still tied share a place, and `score` is the points total.
 */
export function outcome(state: StrikeNightState): Outcome | null {
  if (state.phase !== "over") return null;
  return {
    placements: state.players.toSorted(compare).map((player) => ({
      playerId: player.id,
      place: 1 + state.players.filter((other) => compare(other, player) < 0).length,
      score: player.total,
    })),
  };
}
