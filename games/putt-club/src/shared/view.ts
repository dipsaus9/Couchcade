import type { Player } from "@couchcade/game-sdk/contract";
import type { ControllerView } from "@couchcade/protocol";
import { course } from "./course.ts";
import { holeCount, strokeCap } from "./constants.ts";
import { outcome } from "./outcome.ts";
import { findPlayer, findPlayerBySeat, seatAfter, seatsInPlay } from "./state.ts";
import type { LastStroke, PuttClubState } from "./state.ts";

export type PuttClubScreen = "pc-watch" | "pc-next" | "pc-putt" | "pc-result" | "pc-end";

/** View data from docs/games/putt-club.md, "Screens". Well under 1 KB. */
export type PuttClubView = {
  /** 1 to `holes`. */
  hole: number;
  /** Always `holeCount` (9). */
  holes: number;
  /** This hole's par. */
  par: number;
  /** The hole's name, under 20 characters. */
  name: string;
  /** Echoed in `line` and `putt`. */
  turn: number;
  /** The stroke this player is about to play, 1 to `cap`. */
  stroke: number;
  /** Always `strokeCap` (6). */
  cap: number;
  /** Strokes played so far this match. */
  total: number;
  /** `total` minus the par of the holes this player finished. */
  toPar: number;
  /** The name of the player putting now. */
  putter: string | null;
  /** This player's first turn of the match. */
  first: boolean;
  /** This player's last stroke, null before it. */
  last: LastStroke | null;
};

export type PuttClubControllerView = ControllerView & {
  screen: PuttClubScreen;
  data: PuttClubView;
};

/** The next player due to putt after the current one, or null with nobody left on this hole. */
function nextPutterId(state: PuttClubState): string | null {
  const seats = seatsInPlay(state);
  if (seats.length === 0) return null;
  const putter = findPlayer(state, state.putterId);
  const afterSeat = putter?.seat ?? -1;
  const nextSeat = seatAfter(seats, afterSeat);
  return nextSeat === undefined ? null : (findPlayerBySeat(state, nextSeat)?.id ?? null);
}

/**
 * The host sends views only when they change: one batch when `turn` opens (the putter's
 * `pc-putt`, the next player's `pc-next`, everyone's `pc-watch`) and one when `result` starts (the
 * putter's `pc-result`). `rolling` and `holeEnd` keep the previous phase's screens.
 */
function screenFor(state: PuttClubState, playerId: string): PuttClubScreen {
  switch (state.phase) {
    case "intro":
    case "holeIntro":
      return playerId === state.putterId ? "pc-next" : "pc-watch";
    case "turn":
    case "rolling":
      if (playerId === state.putterId) return "pc-putt";
      return playerId === nextPutterId(state) ? "pc-next" : "pc-watch";
    case "result":
    case "holeEnd":
      if (playerId === state.putterId) return "pc-result";
      return playerId === nextPutterId(state) ? "pc-next" : "pc-watch";
    case "over":
      return "pc-end";
  }
}

/** Sum of `par` for every hole `player` has finished. */
function parPlayed(state: PuttClubState, playerId: string): number {
  const player = findPlayer(state, playerId);
  if (player === undefined) return 0;
  return player.scores.reduce<number>(
    (sum, score, index) => sum + (score !== null ? (course[index]?.par ?? 0) : 0),
    0,
  );
}

/** What a phone shows (docs/games/putt-club.md, "Screens"). */
export function view(state: PuttClubState, player: Player): PuttClubControllerView {
  const current = findPlayer(state, player.id);
  const putter = findPlayer(state, state.putterId);
  const hole = course[state.hole - 1];
  const data: PuttClubView = {
    hole: state.hole,
    holes: holeCount,
    par: hole?.par ?? 0,
    name: hole?.name ?? "",
    turn: state.turn,
    stroke: Math.min(strokeCap, (current?.strokes ?? 0) + 1),
    cap: strokeCap,
    total: current?.total ?? 0,
    toPar: (current?.total ?? 0) - parPlayed(state, player.id),
    putter: putter?.name ?? null,
    first:
      current !== undefined &&
      current.total === 0 &&
      current.strokes === 0 &&
      current.scores.every((score) => score === null),
    last: current?.last ?? null,
  };

  const screen = screenFor(state, player.id);
  if (screen === "pc-putt" && data.first) return { screen, data, cue: "your-turn" };
  if (screen === "pc-result" && current?.last !== null && current?.last !== undefined) {
    const holeScore = current.last.hole;
    const holePar = course[state.hole - 1]?.par;
    if (holeScore !== null && holePar !== undefined && holeScore <= holePar) {
      return { screen, data, cue: "celebrate" };
    }
  }
  if (screen === "pc-end") {
    const place = outcome(state)?.placements.find(
      (placement) => placement.playerId === player.id,
    )?.place;
    if (place === 1) return { screen, data, cue: "celebrate" };
  }
  return { screen, data };
}
