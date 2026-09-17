import type { Player } from "@couchcade/game-sdk/contract";
import type { ControllerView } from "@couchcade/protocol";
import { targetPoints } from "./constants.ts";
import { isMatchDecided } from "./rules.ts";
import { averageMs, findPlayer } from "./state.ts";
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
  /** Only in solo practice. */
  practice?: PracticeView;
};

/** Solo practice on a result: the player's best and average so far, whole ms. */
export type PracticeView = {
  /** This round's valid time beat the best before it. */
  newBest: boolean;
  bestMs: number | null;
  averageMs: number | null;
  /** The match ends after this round, so the phone shows the best and average. */
  final: boolean;
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

  const data: QuickDrawResultView = {
    round,
    target: targetPoints,
    points: current?.points ?? 0,
    result,
    ms: tap?.ms ?? null,
    winner,
  };
  if (state.practice) {
    data.practice = {
      newBest: result === "won" && state.practice.newBest,
      bestMs: current?.bestMs ?? null,
      averageMs: averageMs(state.practice),
      final: state.phase === "over" || isMatchDecided(state),
    };
  }

  return {
    screen: "qd-result",
    data,
    ...(result === "won" ? { cue: "celebrate" as const } : {}),
    ...(result === "foul" || result === "fooled" ? { cue: "foul" as const } : {}),
  };
}
