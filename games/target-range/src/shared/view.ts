import type { Player } from "@couchcade/game-sdk/contract";
import type { ControllerView } from "@couchcade/protocol";
import { bullseyePoints } from "./constants.ts";
import { findPlayer, volleyOf } from "./state.ts";
import type { TargetRangeState, VolleyResult } from "./state.ts";

export type TargetRangeScreen = "tr-watch" | "tr-shoot";

/** View data from docs/games/target-range.md, "Screens". Well under 1 KB. */
export type TargetRangeView = {
  /** 1 to 4. */
  round: number;
  /** 1 to 3: the open arrow, or the one just shot. */
  arrow: number;
  /** 1 to 12, echoed in `shoot` and `lower`. */
  volley: number;
  /** The player's total. */
  points: number;
  /** The last arrow's points (0 is a miss), `late` or `none`, null before the first. */
  last: VolleyResult | null;
};

export type TargetRangeControllerView = ControllerView & {
  screen: TargetRangeScreen;
  data: TargetRangeView;
};

/**
 * What a phone shows. It only changes when a round starts (`tr-watch`), when a volley opens
 * (`tr-shoot`) and when it's revealed (`tr-watch` with the result), so the host sends 2 view
 * batches per volley and 1 per round. `landing` keeps `tr-shoot`, so a phone that is still drawing
 * can shoot and learn at the reveal that it was late. `roundEnd` and `over` keep the reveal's view.
 */
export function view(state: TargetRangeState, player: Player): TargetRangeControllerView {
  const current = findPlayer(state, player.id);
  const last = current?.last ?? null;
  const data: TargetRangeView = {
    round: state.round,
    arrow: state.arrow,
    volley: volleyOf(state),
    points: current?.points ?? 0,
    last,
  };

  switch (state.phase) {
    case "intro":
      return { screen: "tr-watch", data };
    case "open":
    case "landing":
      return {
        screen: "tr-shoot",
        data,
        ...(data.volley === 1 ? { cue: "your-turn" as const } : {}),
      };
    case "reveal":
    case "roundEnd":
    case "over":
      return {
        screen: "tr-watch",
        data,
        ...(last === bullseyePoints ? { cue: "celebrate" as const } : {}),
      };
  }
}
