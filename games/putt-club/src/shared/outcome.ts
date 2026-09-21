import type { Outcome } from "@couchcade/game-sdk/contract";
import { course } from "./course.ts";
import type { PuttClubPlayer, PuttClubState } from "./state.ts";

/** How many of `player`'s finished holes are at or under that hole's par. */
function holesAtOrUnderPar(player: PuttClubPlayer): number {
  return player.scores.filter((score, index) => {
    const par = course[index]?.par;
    return score !== null && par !== undefined && score <= par;
  }).length;
}

/**
 * Negative when `a` places ahead of `b` (rule 13, "Placements"): fewer total strokes, then more
 * holes at or under par, then a count-back from hole 9 down to hole 1 (fewer strokes wins).
 */
export function compare(a: PuttClubPlayer, b: PuttClubPlayer): number {
  if (a.total !== b.total) return a.total - b.total;
  const parTieBreak = holesAtOrUnderPar(b) - holesAtOrUnderPar(a);
  if (parTieBreak !== 0) return parTieBreak;
  for (let hole = a.scores.length; hole >= 1; hole--) {
    const av = a.scores[hole - 1] ?? Number.POSITIVE_INFINITY;
    const bv = b.scores[hole - 1] ?? Number.POSITIVE_INFINITY;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Placements once the match is over, null while it runs. `score` is the stroke total, the only
 * game so far where a smaller `score` is better (finding 11: safe, because the results screen only
 * prints it beside `place`).
 */
export function outcome(state: PuttClubState): Outcome | null {
  if (state.phase !== "over") return null;
  return {
    placements: state.players.toSorted(compare).map((player) => ({
      playerId: player.id,
      place: 1 + state.players.filter((other) => compare(other, player) < 0).length,
      score: player.total,
    })),
  };
}
