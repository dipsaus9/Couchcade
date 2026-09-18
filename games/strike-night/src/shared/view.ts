import type { Player } from "@couchcade/game-sdk/contract";
import type { ControllerView } from "@couchcade/protocol";
import { frameCount } from "./constants.ts";
import { activeSeats, findPlayer, findPlayerBySeat } from "./state.ts";
import type { RollResult, StrikeNightState } from "./state.ts";

export type StrikeNightScreen = "sn-watch" | "sn-next" | "sn-bowl" | "sn-result";

/** View data from docs/games/strike-night.md, "Screens". Well under 1 KB. */
export type StrikeNightView = {
  /** 1 to `frames`: the frame being bowled. */
  frame: number;
  /** Always 10. */
  frames: number;
  /** Echoed in `move`, `grip` and `bowl`. */
  turn: number;
  /** The bowler's roll within the frame. */
  roll: 1 | 2;
  /** This player's last position, −1 to 1. */
  x: number;
  /** This player's points. */
  total: number;
  /** The name of the player bowling now. */
  bowler: string | null;
  /** Pins standing for the current roll, 0 to 10. */
  standing: number;
  /** This player's first turn of the match. */
  first: boolean;
  /** This player's last roll, null before it. */
  last: RollResult | null;
};

export type StrikeNightControllerView = ControllerView & {
  screen: StrikeNightScreen;
  data: StrikeNightView;
};

/** The next active seat after the current bowler, wrapping to the frame's first. */
function nextBowlerId(state: StrikeNightState): string | null {
  const seats = activeSeats(state);
  if (seats.length === 0) return null;
  const bowler = findPlayer(state, state.bowlerId);
  const currentSeat = bowler?.seat ?? -1;
  const nextSeat = seats.find((seat) => seat > currentSeat) ?? (seats[0] as number);
  return findPlayerBySeat(state, nextSeat)?.id ?? null;
}

/**
 * The host sends views only when they change: one batch when `lineup` starts (the bowler's
 * `sn-bowl`, the next bowler's `sn-next`, everyone's `sn-watch`) and one when `result` starts (the
 * bowler's `sn-result`). `rolling` and `frameEnd` keep the previous phase's screens, since nothing
 * new is shown until the next batch.
 */
function screenFor(state: StrikeNightState, playerId: string): StrikeNightScreen {
  switch (state.phase) {
    case "intro":
      return playerId === state.bowlerId ? "sn-next" : "sn-watch";
    case "lineup":
    case "rolling":
      if (playerId === state.bowlerId) return "sn-bowl";
      return playerId === nextBowlerId(state) ? "sn-next" : "sn-watch";
    case "result":
    case "frameEnd":
      if (playerId === state.bowlerId) return "sn-result";
      return playerId === nextBowlerId(state) ? "sn-next" : "sn-watch";
    case "over":
      return "sn-watch";
  }
}

/** What a phone shows (docs/games/strike-night.md, "Screens"). */
export function view(state: StrikeNightState, player: Player): StrikeNightControllerView {
  const current = findPlayer(state, player.id);
  const bowler = findPlayer(state, state.bowlerId);
  const data: StrikeNightView = {
    frame: state.frame,
    frames: frameCount,
    turn: state.turn,
    roll: state.roll,
    x: current?.x ?? 0,
    total: current?.total ?? 0,
    bowler: bowler?.name ?? null,
    standing: state.standingPins.length,
    first: current !== undefined && current.frames.every((frame) => frame.roll1 === null),
    last: current?.last ?? null,
  };

  const screen = screenFor(state, player.id);
  if (screen === "sn-bowl" && data.roll === 1) return { screen, data, cue: "your-turn" };
  if (screen === "sn-result" && current?.last?.mark === "strike")
    return { screen, data, cue: "celebrate" };
  return { screen, data };
}
