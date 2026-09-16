import type { CouchcadeGame, Outcome } from "@couchcade/game-sdk/contract";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { describe, expect, it } from "vitest";
import type { LobbyState } from "../../src/screens/lobby/lobby-state.ts";
import {
  createGameResults,
  placeLabel,
  resultsHeadline,
  resultsStandings,
  type GameResultsOptions,
  type ResultsStanding,
} from "../../src/screens/results/results.ts";
import { echoGame, lobbyWith } from "../runtime/fixtures.ts";

const players = createPlayers(4);
const [p1, p2, p3] = players;

const outcomeOf = (placements: Outcome["placements"]): Outcome => ({ placements });

function setup({
  game = { ...echoGame({ min: 2, max: 4 }), title: "Echo" } as CouchcadeGame,
  outcome = outcomeOf([
    { playerId: p1!.id, place: 1, score: 3 },
    { playerId: p2!.id, place: 2, score: 1 },
  ]),
  roster = players.slice(0, 2),
  lobby = lobbyWith(2),
} = {}) {
  let state: LobbyState = lobby;
  const playedAgain: CouchcadeGame[] = [];
  let backToMenus = 0;
  const options: GameResultsOptions = {
    game,
    outcome,
    players: roster,
    lobby: () => state,
    onPlayAgain: (g) => playedAgain.push(g),
    onBackToMenu: () => (backToMenus += 1),
  };
  const results = createGameResults(options);
  return {
    results,
    playedAgain,
    backToMenu: () => backToMenus,
    setLobby: (next: LobbyState) => (state = next),
    lobby: () => state,
  };
}

describe("resultsStandings", () => {
  it("sorts by place, ties keeping the shared place and join order", () => {
    const standings = resultsStandings(
      [
        { playerId: p3!.id, place: 1, score: 5 },
        { playerId: p1!.id, place: 1, score: 5 },
        { playerId: p2!.id, place: 3 },
      ],
      players,
    );
    expect(standings.map((entry) => [entry.player.id, entry.place])).toEqual([
      [p1!.id, 1],
      [p3!.id, 1],
      [p2!.id, 3],
    ]);
  });

  it("drops a placement for a player the host no longer knows", () => {
    const standings = resultsStandings(
      [
        { playerId: p1!.id, place: 1 },
        { playerId: "ghost", place: 2 },
      ],
      players,
    );
    expect(standings.map((entry) => entry.player.id)).toEqual([p1!.id]);
  });
});

describe("resultsHeadline", () => {
  const standingsWithWinners = (ids: string[]): ResultsStanding[] =>
    ids.map((id) => ({ player: players.find((p) => p.id === id)!, place: 1 }));

  it("names the one winner", () => {
    expect(resultsHeadline(standingsWithWinners([p1!.id]))).toBe("Player 1 wins!");
  });

  it("names both winners of a two-way tie", () => {
    expect(resultsHeadline(standingsWithWinners([p1!.id, p2!.id]))).toBe(
      "Player 1 and Player 2 win!",
    );
  });

  it("says it's a tie for three or more winners", () => {
    expect(resultsHeadline(standingsWithWinners([p1!.id, p2!.id, p3!.id]))).toBe("It's a tie!");
  });
});

describe("placeLabel", () => {
  it("labels ordinals, including the 11 to 13 exception", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(placeLabel)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
    ]);
  });
});

describe("createGameResults", () => {
  it("can play again when the game still fits the seated players", () => {
    const { results } = setup();
    expect(results.canPlayAgain).toBe(true);
    expect(results.hint).toBeNull();
  });

  it("disables play again with a hint when the game no longer fits", () => {
    const { results, setLobby } = setup();
    setLobby(lobbyWith(1));
    expect(results.canPlayAgain).toBe(false);
    expect(results.hint).toBe("Echo needs 2 to 4 players");
  });

  it("only the VIP's play-again and back-to-menu count", () => {
    const { results, lobby, playedAgain, backToMenu } = setup();
    const other = lobby().players[1]!.id;
    results.action(other, { action: "play-again" });
    results.action(other, { action: "back-to-menu" });
    expect(playedAgain).toEqual([]);
    expect(backToMenu()).toBe(0);

    const vipId = lobby().players[0]!.id;
    results.action(vipId, { action: "play-again" });
    expect(playedAgain).toEqual([expect.objectContaining({ id: "echo" })]);
    results.action(vipId, { action: "back-to-menu" });
    expect(backToMenu()).toBe(1);
  });

  it("ignores play-again once the game no longer fits", () => {
    const { results, lobby, setLobby, playedAgain } = setup();
    setLobby(lobbyWith(1));
    const vipId = lobby().players[0]!.id;
    results.action(vipId, { action: "play-again" });
    expect(playedAgain).toEqual([]);
  });

  it("gives the VIP their placement and the actions, others just their placement", () => {
    const { results, lobby } = setup();
    const [vipId, otherId] = lobby().players.map((player) => player.id);
    const views = results.views();
    expect(views.get(vipId!)).toEqual({
      screen: "results",
      data: {
        title: "Echo",
        vipName: p1!.name,
        place: 1,
        of: 2,
        score: 3,
        vip: { canPlayAgain: true, hint: null },
      },
    });
    expect(views.get(otherId!)).toEqual({
      screen: "results",
      data: { title: "Echo", vipName: p1!.name, place: 2, of: 2, score: 1 },
    });
  });

  it("sends next-game to a seated player who wasn't in this game", () => {
    const fourSeated = lobbyWith(4);
    const { results } = setup({ roster: players.slice(0, 2), lobby: fourSeated });
    const lateJoiner = fourSeated.players[2]!.id;
    const views = results.views();
    expect(views.get(lateJoiner)).toEqual({ screen: "next-game", data: null });
  });

  it("still gives the VIP the actions even when they weren't in the game", () => {
    const fourSeated = lobbyWith(4);
    // The VIP is the lowest joinedAt, always players[0], who is in the roster here, so swap in a
    // lobby whose VIP (players[0]) is not one of the two who played.
    const roster = fourSeated.players.slice(2, 4);
    const outcome = outcomeOf([
      { playerId: roster[0]!.id, place: 1 },
      { playerId: roster[1]!.id, place: 2 },
    ]);
    const { results } = setup({ roster, lobby: fourSeated, outcome });
    const vipId = fourSeated.players[0]!.id;
    const view = results.views().get(vipId);
    expect(view?.screen).toBe("results");
    expect(view?.data).toMatchObject({ vip: { canPlayAgain: true, hint: null } });
    expect(view?.data).not.toHaveProperty("place");
  });
});
