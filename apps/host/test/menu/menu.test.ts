import type { CouchcadeGame } from "@couchcade/game-sdk/contract";
import { encode } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import type { LobbyState } from "../../src/screens/lobby/lobby-state.ts";
import {
  countdownMs,
  createGameMenu,
  fits,
  menuGames,
  menuView,
  playerCountLabel,
  secondsLeft,
  surprisePick,
  type MenuGame,
  type UiAction,
} from "../../src/screens/menu/menu.ts";
import { createVirtualTime, echoGame, fakeMetaRegistry, lobbyWith } from "../runtime/fixtures.ts";

const game = (id: string, min: number, max: number, title = id) =>
  ({ ...echoGame({ id, min, max }), title }) as CouchcadeGame;

function setup({
  games = [game("alpha", 2, 8), game("bravo", 1, 4), game("charlie", 5, 8)],
  players = 3,
  random = () => 0,
} = {}) {
  const time = createVirtualTime(50_000);
  const started: string[] = [];
  let changes = 0;
  let lobby: LobbyState = lobbyWith(players);
  const menu = createGameMenu({
    registry: fakeMetaRegistry(games),
    lobby: () => lobby,
    // The room clock runs 1 second ahead of the laptop.
    roomNow: () => time.now() + 1000,
    schedule: time.schedule,
    random,
    onStart: (gameId) => {
      started.push(gameId);
      menu.close(gameId);
    },
    onChange: () => (changes += 1),
  });
  const [vip, other] = lobby.players.map((player) => player.id) as [string, string];
  const act = (from: string, action: UiAction["action"], value?: string) =>
    menu.action(from, value === undefined ? { action } : { action, value });
  return {
    time,
    menu,
    started,
    vip,
    other,
    act,
    changes: () => changes,
    setLobby: (next: LobbyState) => (lobby = next),
    lobby: () => lobby,
  };
}

describe("fit rule", () => {
  it("fits when min <= seated <= max", () => {
    const g = { players: { min: 2, max: 4 } };
    expect([1, 2, 3, 4, 5].map((seated) => fits(g, seated))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it("keeps games that don't fit on the list, greyed out, in registry order", () => {
    const games = menuGames([game("alpha", 2, 8), game("bravo", 1, 4), game("charlie", 5, 8)], 5);
    expect(games.map((g) => [g.id, g.fits])).toEqual([
      ["alpha", true],
      ["bravo", false],
      ["charlie", true],
    ]);
  });

  it("counts a seat kept for a dropped phone", () => {
    const { menu, lobby, setLobby } = setup({ games: [game("four", 4, 4)], players: 4 });
    const players = lobby().players.map((p, i) => (i === 3 ? { ...p, connected: false } : p));
    setLobby({ ...lobby(), players });
    expect(menu.games()[0]?.fits).toBe(true);
  });
});

describe("menu view", () => {
  it("encodes each game as [id, title, flags]", () => {
    const games: MenuGame[] = [
      { id: "a", title: "A", min: 1, max: 8, needsMotion: false, fits: true },
      { id: "b", title: "B", min: 1, max: 8, needsMotion: true, fits: false },
      { id: "c", title: "C", min: 1, max: 8, needsMotion: true, fits: true },
    ];
    expect(menuView(games, { gameId: "a", startsAt: 9000 })).toEqual({
      games: [
        ["a", "A", 1],
        ["b", "B", 2],
        ["c", "C", 3],
      ],
      picked: "a",
      startsAt: 9000,
    });
    expect(menuView(games, null)).toMatchObject({ picked: null, startsAt: null });
  });

  it("fits 24 games with 16-character titles in one 1 KB controller:state frame", () => {
    // 9-character ids like "putt-club": the 35 bytes per game session-flow.md budgets. Each extra id
    // character costs 24 bytes here, so 10-character ids already need the paging follow-up at 24 games.
    const games: MenuGame[] = Array.from({ length: 24 }, (_, i) => ({
      id: `game-i-${String(i).padStart(2, "0")}`,
      title: `Sixteen chars ${String(i).padStart(2, "0")}`,
      min: 1,
      max: 8,
      needsMotion: true,
      fits: true,
    }));
    expect(games[0]!.title).toHaveLength(16);
    const view = menuView(games, { gameId: games[23]!.id, startsAt: 1_789_000_000_000 });
    const frame = encode({
      t: "controller:state",
      d: { gameId: null, views: [{ to: ["ABCDEFGH"], view: { screen: "menu", data: view } }] },
    });
    expect(new TextEncoder().encode(frame).length).toBeLessThanOrEqual(1024);
  });

  it("labels player counts and whole seconds left", () => {
    expect(playerCountLabel({ min: 2, max: 8 })).toBe("2 to 8 players");
    expect(playerCountLabel({ min: 1, max: 4 })).toBe("Up to 4 players");
    expect(playerCountLabel({ min: 2, max: 2 })).toBe("2 players");
    expect(playerCountLabel({ min: 1, max: 1 })).toBe("1 player");
    expect([3000, 2001, 2000, 1, 0, -500].map((ms) => secondsLeft(ms, 0))).toEqual([
      3, 3, 2, 1, 1, 1,
    ]);
  });
});

/** Menu games g0, g1, … that fit or not. */
const list = (fitting: boolean[]): MenuGame[] =>
  fitting.map((fit, i) => ({
    id: `g${i}`,
    title: `G${i}`,
    min: 1,
    max: 8,
    needsMotion: false,
    fits: fit,
  }));

describe("Surprise me", () => {
  it("picks a random fitting game", () => {
    const games = list([false, true, true]);
    expect(surprisePick(games, null, () => 0)).toBe("g1");
    expect(surprisePick(games, null, () => 0.99)).toBe("g2");
  });

  it("never picks the game just played when another one fits", () => {
    expect(surprisePick(list([true, true]), "g0", () => 0)).toBe("g1");
    expect(surprisePick(list([true, false]), "g0", () => 0)).toBe("g0");
  });

  it("gives null when nothing fits", () => {
    expect(surprisePick(list([false]), null, () => 0)).toBeNull();
  });
});

describe("createGameMenu", () => {
  it("only counts actions from the VIP", () => {
    const { menu, act, other, vip, time, started, changes } = setup();
    act(other, "start");
    act(other, "pick-game", "alpha");
    expect(menu.open).toBe(false);
    expect(changes()).toBe(0);

    act(vip, "start");
    act(other, "pick-game", "alpha");
    expect(menu.countdown).toBeNull();

    act(vip, "pick-game", "alpha");
    act(other, "back-to-menu");
    time.advance(countdownMs);
    expect(started).toEqual(["alpha"]);
  });

  it("follows the VIP when the first player drops", () => {
    const { menu, act, vip, other, lobby, setLobby } = setup();
    setLobby({
      ...lobby(),
      players: lobby().players.map((p) => (p.id === vip ? { ...p, connected: false } : p)),
    });
    act(vip, "start");
    expect(menu.open).toBe(false);
    act(other, "start");
    expect(menu.open).toBe(true);
  });

  it("starts the picked game when the 3 second countdown ends", () => {
    const { menu, act, vip, time, started, changes } = setup();
    act(vip, "start");
    expect(menu.open).toBe(true);
    expect(changes()).toBe(1);

    act(vip, "pick-game", "alpha");
    expect(menu.countdown).toEqual({ gameId: "alpha", startsAt: 50_000 + 1000 + countdownMs });
    time.advance(countdownMs - 1);
    expect(started).toEqual([]);
    time.advance(1);
    expect(started).toEqual(["alpha"]);
    expect(menu.open).toBe(false);
    expect(menu.countdown).toBeNull();
  });

  it("restarts the countdown when the VIP picks another game", () => {
    const { menu, act, vip, time, started } = setup();
    act(vip, "start");
    act(vip, "pick-game", "alpha");
    time.advance(2000);
    act(vip, "pick-game", "bravo");
    expect(menu.countdown?.gameId).toBe("bravo");

    time.advance(countdownMs - 1);
    expect(started).toEqual([]);
    time.advance(1);
    expect(started).toEqual(["bravo"]);
    time.advance(10_000);
    expect(started).toEqual(["bravo"]);
    expect(time.pending).toBe(0);
  });

  it("cancels the countdown on back-to-menu and stays in the menu", () => {
    const { menu, act, vip, time, started, changes } = setup();
    act(vip, "start");
    act(vip, "pick-game", "alpha");
    time.advance(2500);
    act(vip, "back-to-menu");
    expect(menu.countdown).toBeNull();
    expect(menu.open).toBe(true);
    expect(changes()).toBe(3);
    time.advance(10_000);
    expect(started).toEqual([]);
    expect(time.pending).toBe(0);

    // Nothing to cancel: ignored.
    act(vip, "back-to-menu");
    expect(changes()).toBe(3);
  });

  it("ignores picks of unknown games and games that don't fit", () => {
    const { menu, act, vip, changes } = setup();
    act(vip, "start");
    act(vip, "pick-game", "charlie");
    act(vip, "pick-game", "nope");
    expect(menu.countdown).toBeNull();
    expect(changes()).toBe(1);
  });

  it("cancels at the end when the game no longer fits", () => {
    const { menu, act, vip, time, started, changes, setLobby } = setup();
    act(vip, "start");
    act(vip, "pick-game", "alpha");
    setLobby(lobbyWith(1));
    time.advance(countdownMs);
    expect(started).toEqual([]);
    expect(menu.countdown).toBeNull();
    expect(menu.open).toBe(true);
    expect(changes()).toBe(3);
    expect(menu.games().find((g) => g.id === "alpha")?.fits).toBe(false);
  });

  it("opens the menu and picks a fitting game for Surprise me, avoiding the last game", () => {
    const { menu, act, vip, time, started } = setup();
    act(vip, "pick-game");
    expect(menu.open).toBe(true);
    expect(menu.countdown?.gameId).toBe("alpha");
    time.advance(countdownMs);
    expect(started).toEqual(["alpha"]);

    act(vip, "pick-game");
    expect(menu.countdown?.gameId).toBe("bravo");
  });

  it("opens the menu without a pick when Surprise me finds nothing that fits", () => {
    const { menu, act, vip } = setup({ games: [game("big", 6, 8)] });
    act(vip, "pick-game");
    expect(menu.open).toBe(true);
    expect(menu.countdown).toBeNull();
  });

  it("sends the VIP the menu and everyone else vip-choosing, then waiting during the countdown", () => {
    const { menu, act, vip, other, lobby } = setup();
    act(vip, "start");
    const views = menu.views();
    expect(views.size).toBe(3);
    expect(views.get(vip)).toEqual({
      screen: "menu",
      data: {
        games: [
          ["alpha", "alpha", 1],
          ["bravo", "bravo", 1],
          ["charlie", "charlie", 0],
        ],
        picked: null,
        startsAt: null,
      },
    });
    const vipName = lobby().players[0]!.name;
    expect(views.get(other)).toEqual({ screen: "vip-choosing", data: { name: vipName } });

    act(vip, "pick-game", "bravo");
    expect(menu.views().get(vip)?.data).toMatchObject({ picked: "bravo", startsAt: 54_000 });
    expect(menu.views().get(other)).toEqual({ screen: "waiting", data: null });
  });

  it("stops the timer on dispose", () => {
    const { menu, act, vip, time, started } = setup();
    act(vip, "pick-game", "alpha");
    menu.dispose();
    time.advance(countdownMs);
    expect(started).toEqual([]);
    expect(time.pending).toBe(0);
  });
});
