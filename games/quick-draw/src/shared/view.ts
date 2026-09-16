import type { Player } from "@couchcade/game-sdk/contract";
import type { ControllerView } from "@couchcade/protocol";
import { targetPoints } from "./constants.ts";
import { findPlayer } from "./state.ts";
import type { QuickDrawState } from "./state.ts";

export type QuickDrawScreen = "qd-watch" | "qd-standoff" | "qd-result";

export type RoundResult = "won" | "lost" | "foul" | "fooled" | "slow";

/** `qd-watch` and `qd-standoff`. */
export type QuickDrawRoundView = { round: number; target: typeof targetPoints; points: number };

/** `qd-result`. `winner` is a name, `ms` the player's own reaction time. */
export type QuickDrawResultView = QuickDrawRoundView & {
  result: RoundResult;
  ms: number | null;
  winner: string | null;
};

export type QuickDrawView = QuickDrawRoundView | QuickDrawResultView;

export type QuickDrawControllerView = ControllerView & {
  screen: QuickDrawScreen;
  data: QuickDrawView;
};

/**
 * What a phone shows. It only changes at the start (`qd-watch`), when a standoff starts
 * (`qd-standoff`) and when a round resolves (`qd-result`), so the host sends two view batches per
 * round. The next round's intro keeps the last result, and a foul during the standoff doesn't
 * change the view: the phone is already on its local "Tapped!" state.
 */
export function view(state: QuickDrawState, player: Player): QuickDrawControllerView {
  const points = findPlayer(state, player.id)?.points ?? 0;

  switch (state.phase) {
    case "intro":
      // Round 1, or a match restored after a TV refresh, has no previous result to keep showing.
      return state.players.every((other) => other.result === null)
        ? { screen: "qd-watch", data: { round: state.round, target: targetPoints, points } }
        : resultView(state, player, state.round - 1);
    case "standoff":
    case "draw":
      return {
        screen: "qd-standoff",
        data: { round: state.round, target: targetPoints, points },
        ...(state.round === 1 ? { cue: "your-turn" as const } : {}),
      };
    case "result":
    case "over":
      return resultView(state, player, state.round);
  }
}

function resultView(state: QuickDrawState, player: Player, round: number): QuickDrawControllerView {
  const current = findPlayer(state, player.id);
  const tap = current?.result ?? null;
  const won = state.winners.includes(player.id);
  const result: RoundResult = won
    ? "won"
    : tap?.kind === "valid"
      ? "lost"
      : tap?.kind === "foul" || tap?.kind === "fooled"
        ? tap.kind
        : "slow";
  const winnerId = won ? player.id : state.winners[0];
  const winner = winnerId === undefined ? null : (findPlayer(state, winnerId)?.name ?? null);

  return {
    screen: "qd-result",
    data: {
      round,
      target: targetPoints,
      points: current?.points ?? 0,
      result,
      ms: tap?.ms ?? null,
      winner,
    },
    ...(result === "won" ? { cue: "celebrate" as const } : {}),
    ...(result === "foul" || result === "fooled" ? { cue: "foul" as const } : {}),
  };
}
