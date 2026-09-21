import type { Outcome } from "@couchcade/game-sdk/contract";
import type { BandejaState } from "./state.ts";

/**
 * Placements once the match is over, null while it runs (rule 12, "Placements"). A player's score
 * is their own side's points; place is 1 plus how many players scored strictly more. That single
 * formula gives 1, 1, 3, 3 in doubles and 1, 2 in singles without special-casing player count, and
 * places everyone at 1 in the rare tie a side-empties-mid-match end can leave.
 */
export function outcome(state: BandejaState): Outcome | null {
  if (state.phase !== "over") return null;
  const scores = state.players.map((player) => state.scores[player.side]);
  return {
    placements: state.players.map((player, index) => {
      const score = scores[index] as number;
      return {
        playerId: player.id,
        place: 1 + scores.filter((other) => other > score).length,
        score,
      };
    }),
  };
}
