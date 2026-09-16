import type { CouchcadeGame, Outcome, Player } from "@couchcade/game-sdk/contract";
import type { ControllerView, JsonValue } from "@couchcade/protocol";
import { seatedPlayers, vip, type LobbyState } from "../lobby/lobby-state.ts";
import { fits, playerCountLabel, type UiAction } from "../menu/menu.ts";

/** One player's place in the final standings, with the roster entry for name, slot and colour. */
export interface ResultsStanding {
  player: Player;
  place: number;
  score?: number;
}

export interface GameResultsOptions {
  game: CouchcadeGame;
  outcome: Outcome;
  /** The in-game roster, in join order (`RunningGame.runner.players`). */
  players: readonly Player[];
  lobby(): LobbyState | null;
  /** "Play again" was picked and the game still fits. The runtime starts it with a new seed. */
  onPlayAgain(game: CouchcadeGame): void;
  /** "Back to menu" was picked. */
  onBackToMenu(): void;
}

export interface GameResults {
  readonly game: CouchcadeGame;
  /** Every in-game player, sorted by place then join order. Ties share a place. */
  readonly standings: ResultsStanding[];
  /** `standings` limited to places 1 to 3, for the podium. */
  readonly podium: ResultsStanding[];
  /** "Noor wins!", "Noor and Sam win!" or "It's a tie!". */
  readonly headline: string;
  /** True when the game still fits the currently seated players. */
  readonly canPlayAgain: boolean;
  /** Why "Play again" is disabled, or null when it isn't. */
  readonly hint: string | null;
  /**
   * Applies a `ui:action` from `from` (session-flow.md, "Results", steps 4 to 5). Only the current
   * VIP counts. `play-again` starts the same game again when it still fits, `back-to-menu` opens
   * the menu.
   */
  action(from: string, action: UiAction): void;
  /** What each seated phone shows: the VIP gets the actions, other in-game players their
   * placement, and seated players who weren't in this game get `next-game`. */
  views(): Map<string, ControllerView>;
}

/**
 * Placements matched to their player, sorted by place (ties keep their shared place) and then by
 * join order. A placement for a player no longer known to the host (left for good mid-game) is
 * dropped: there's no name or colour left to show.
 */
export function resultsStandings(
  placements: Outcome["placements"],
  players: readonly Player[],
): ResultsStanding[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  const order = new Map(players.map((player, index) => [player.id, index]));
  const standings: ResultsStanding[] = [];
  for (const placement of placements) {
    const player = byId.get(placement.playerId);
    if (player === undefined) continue;
    standings.push({ player, place: placement.place, score: placement.score });
  }
  return standings.toSorted(
    (a, b) => a.place - b.place || order.get(a.player.id)! - order.get(b.player.id)!,
  );
}

/** "Noor wins!" for one winner, "Noor and Sam win!" for two, "It's a tie!" for three or more. */
export function resultsHeadline(standings: readonly ResultsStanding[]): string {
  const winners = standings.filter((entry) => entry.place === 1);
  if (winners.length === 0) return "It's over!";
  if (winners.length === 1) return `${winners[0]!.player.name} wins!`;
  if (winners.length === 2) return `${winners[0]!.player.name} and ${winners[1]!.player.name} win!`;
  return "It's a tie!";
}

/** "1st", "2nd", "3rd", "4th", "11th", ... */
export function placeLabel(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

/**
 * The results screen after a game ends (docs/architecture/session-flow.md, "Results"): one game's
 * placements, shown until the VIP picks "Play again" or "Back to menu". It owns no timer.
 */
export function createGameResults(options: GameResultsOptions): GameResults {
  const standings = resultsStandings(options.outcome.placements, options.players);
  const byId = new Map(standings.map((entry) => [entry.player.id, entry]));

  const seatedCount = (): number => {
    const lobby = options.lobby();
    return lobby === null ? 0 : seatedPlayers(lobby).length;
  };
  const canPlayAgain = (): boolean => fits(options.game, seatedCount());
  const hint = (): string | null =>
    canPlayAgain() ? null : `${options.game.title} needs ${playerCountLabel(options.game.players)}`;

  return {
    game: options.game,
    standings,
    podium: standings.filter((entry) => entry.place <= 3),
    headline: resultsHeadline(standings),

    get canPlayAgain() {
      return canPlayAgain();
    },
    get hint() {
      return hint();
    },

    action(from, { action }) {
      const lobby = options.lobby();
      if (lobby === null || from !== vip(lobby)?.id) return;
      if (action === "play-again") {
        if (canPlayAgain()) options.onPlayAgain(options.game);
      } else if (action === "back-to-menu") {
        options.onBackToMenu();
      }
    },

    views() {
      const lobby = options.lobby();
      const views = new Map<string, ControllerView>();
      if (lobby === null) return views;
      const leaderId = vip(lobby)?.id;
      const leaderName = vip(lobby)?.name ?? null;
      const canPlay = canPlayAgain();
      const disabledHint = hint();
      for (const player of seatedPlayers(lobby)) {
        const standing = byId.get(player.id);
        if (standing === undefined && player.id !== leaderId) {
          // Seated but not in this game (a late joiner or promoted audience): wait for the next one.
          views.set(player.id, { screen: "next-game", data: null });
          continue;
        }
        const placement =
          standing === undefined
            ? {}
            : {
                place: standing.place,
                of: standings.length,
                ...(standing.score === undefined ? {} : { score: standing.score }),
              };
        const data: Record<string, JsonValue> = {
          title: options.game.title,
          vipName: leaderName,
          ...placement,
        };
        if (player.id === leaderId) data.vip = { canPlayAgain: canPlay, hint: disabledHint };
        views.set(player.id, { screen: "results", data });
      }
      return views;
    },
  };
}
