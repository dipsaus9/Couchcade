import { createRoomClock } from "@couchcade/game-sdk/clock";
import type { CouchcadeGame } from "@couchcade/game-sdk/contract";
import { createRegistry } from "@couchcade/game-sdk/registry";
import type { HostToRelayMessage, RelayToHostMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { countdownMs } from "../../src/screens/menu/menu.ts";
import { createHostRuntime } from "../../src/runtime/host-runtime.ts";
import type { GameStage } from "../../src/runtime/stage.ts";
import {
  createVirtualTime,
  echoGame,
  backAction,
  inputMessage,
  lobbyWith,
  pickAction,
  playAgainAction,
  startAction,
  type EchoState,
} from "./fixtures.ts";

function setup({ games = [echoGame()] as CouchcadeGame[], sceneFails = false } = {}) {
  const time = createVirtualTime(1_000_000);
  const sent: HostToRelayMessage[] = [];
  const warnings: string[] = [];
  const stageLog: string[] = [];
  let changes = 0;
  const stage: GameStage = {
    start: (game, data) => {
      stageLog.push(`start ${game.id} ${data.players.length}`);
      return sceneFails ? Promise.reject(new Error("no scene")) : Promise.resolve();
    },
    stop: (game) => stageLog.push(`stop ${game.id}`),
  };
  const clock = createRoomClock({ now: time.now, schedule: time.schedule });
  const registry = createRegistry(
    Object.fromEntries(games.map((game) => [`games/${game.id}/src/index.ts`, game])),
  );
  const runtime = createHostRuntime({
    registry,
    stage,
    clock,
    send: (message) => sent.push(message),
    now: time.now,
    schedule: time.schedule,
    createSeed: () => 7,
    warn: (message) => warnings.push(message),
    onChange: () => (changes += 1),
  });
  const lobby = lobbyWith(3);
  const [vip, second] = lobby.players.map((player) => player.id) as [string, string];
  const handle = (message: RelayToHostMessage, state = lobby) => runtime.handle(message, state);
  /** The VIP opens the menu, picks `gameId` and the countdown runs out. */
  const play = (gameId = "echo") => {
    handle(startAction(vip));
    handle(pickAction(vip, gameId));
    time.advance(countdownMs);
  };
  const ofType = <T extends HostToRelayMessage["t"]>(t: T) =>
    sent.filter((message): message is Extract<HostToRelayMessage, { t: T }> => message.t === t);
  return {
    time,
    sent,
    warnings,
    stageLog,
    runtime,
    lobby,
    vip,
    second,
    handle,
    play,
    ofType,
    changes: () => changes,
  };
}

/** Lets the fake scene load: ticking starts after it, in a later task. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A `clock:pong` from a room clock 3 seconds ahead of this laptop, with no network delay. */
const pong = (d: { id: number; t0: number }): RelayToHostMessage => ({
  t: "clock:pong",
  d: { ...d, t1: Math.round(d.t0) + 3000 },
});

const welcome = (phase: "menu" | "lobby"): RelayToHostMessage => ({
  t: "room:welcome",
  d: { role: "host", code: "BEAN", phase, locked: false },
});

const echoState = (runtime: ReturnType<typeof setup>["runtime"]) =>
  runtime.running?.runner.state as EchoState;

describe("createHostRuntime", () => {
  it("gives the VIP the game buttons in the lobby and follows the VIP when they drop", () => {
    const { handle, vip, second, lobby, ofType, time } = setup();
    const third = lobby.players[2]!.id;
    handle({ t: "player:joined", d: { player: lobby.players[2]! } });
    expect(ofType("controller:state").at(-1)?.d).toEqual({
      gameId: null,
      views: [
        { to: [vip], view: { screen: "lobby", data: { vip: true } } },
        { to: [second, third], view: { screen: "lobby", data: { vip: false } } },
      ],
    });

    const dropped = {
      ...lobby,
      players: lobby.players.map((p) => (p.id === vip ? { ...p, connected: false } : p)),
    };
    handle({ t: "player:left", d: { id: vip, reason: "disconnected" } }, dropped);
    time.advance(667);
    expect(ofType("controller:state")).toHaveLength(2);
    expect(ofType("controller:state").at(-1)?.d.views).toEqual([
      { to: [vip], view: { screen: "lobby", data: { vip: false } } },
      { to: [second], view: { screen: "lobby", data: { vip: true } } },
    ]);
    // Only the new VIP can open the menu now.
    handle(startAction(vip), dropped);
    handle(startAction(second), dropped);
    expect(ofType("room:phase")).toEqual([{ t: "room:phase", d: { phase: "menu" } }]);
  });

  it("opens the menu only for the VIP: TV phase, the VIP's list and vip-choosing for others", () => {
    const { runtime, handle, second, vip, sent, ofType, changes, lobby } = setup({
      games: [echoGame(), echoGame({ id: "big", min: 4 })],
    });
    handle(startAction(second));
    handle(pickAction(second, "echo"));
    expect(runtime.phase).toBe("lobby");
    expect(sent).toEqual([]);

    handle(startAction(vip));
    expect(runtime.phase).toBe("menu");
    expect(changes()).toBe(1);
    expect(ofType("room:phase")).toEqual([{ t: "room:phase", d: { phase: "menu" } }]);
    expect(runtime.menu?.games.map(({ id, fits }) => [id, fits])).toEqual([
      ["big", false],
      ["echo", true],
    ]);
    expect(ofType("controller:state").at(-1)?.d).toEqual({
      gameId: null,
      views: [
        {
          to: [vip],
          view: {
            screen: "menu",
            data: {
              games: [
                ["big", "Echo", 0],
                ["echo", "Echo", 1],
              ],
              picked: null,
              startsAt: null,
            },
          },
        },
        {
          to: lobby.players.slice(1).map((player) => player.id),
          view: { screen: "vip-choosing", data: { name: lobby.players[0]!.name } },
        },
      ],
    });
  });

  it("starts the picked game with the seated players and a seed when the countdown ends", async () => {
    const games = [echoGame({ id: "zebra" }), echoGame({ id: "aardvark" })];
    const { runtime, handle, vip, lobby, ofType, stageLog, time } = setup({ games });
    handle(startAction(vip));
    handle(pickAction(vip, "zebra"));
    expect(runtime.menu?.countdown?.gameId).toBe("zebra");
    time.advance(countdownMs - 1);
    expect(runtime.running).toBeNull();
    time.advance(1);
    await settle();

    expect(runtime.running?.game.id).toBe("zebra");
    expect(runtime.phase).toBe("playing");
    expect(runtime.menu).toBeNull();
    expect(echoState(runtime).players).toEqual(lobby.players.map((player) => player.id));
    expect(echoState(runtime).seed).toBe(7);
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual(["menu", "playing"]);
    expect(ofType("controller:state").at(-1)?.d.gameId).toBe("zebra");
    expect(stageLog).toEqual(["start zebra 3"]);
  });

  it("cancels the countdown on back-to-menu", () => {
    const { runtime, handle, vip, time } = setup();
    handle(startAction(vip));
    handle(pickAction(vip, "echo"));
    time.advance(1000);
    handle(backAction(vip));
    expect(runtime.menu?.countdown).toBeNull();
    time.advance(countdownMs * 2);
    expect(runtime.running).toBeNull();
    expect(runtime.phase).toBe("menu");
  });

  it("ignores picks of games that don't fit and menu actions while a game runs", () => {
    const tooFew = setup({ games: [echoGame({ min: 4 })] });
    tooFew.handle(startAction(tooFew.vip));
    tooFew.handle(pickAction(tooFew.vip, "echo"));
    tooFew.time.advance(countdownMs);
    expect(tooFew.runtime.running).toBeNull();
    expect(tooFew.runtime.menu?.countdown).toBeNull();

    const busy = setup();
    busy.play();
    const runner = busy.runtime.running?.runner;
    busy.handle(startAction(busy.vip));
    busy.handle(pickAction(busy.vip, "echo"));
    busy.time.advance(countdownMs);
    expect(busy.runtime.running?.runner).toBe(runner);
    expect(busy.ofType("room:phase")).toHaveLength(2);
  });

  it("ticks at a fixed 60 Hz once the scene has loaded", async () => {
    const { runtime, play, time } = setup();
    play();
    time.advance(500);
    expect(runtime.running?.runner.tick).toBe(0);

    await settle();
    time.advance(1001);
    expect(runtime.running?.runner.tick).toBe(60);
    time.advance(2000);
    expect(runtime.running?.runner.tick).toBe(180);
  });

  it("still runs the game when the scene fails to load, with a warning", async () => {
    const { runtime, play, time, warnings } = setup({ sceneFails: true });
    play();
    await settle();
    time.advance(1001);
    expect(runtime.running?.runner.tick).toBe(60);
    expect(warnings).toEqual([expect.stringContaining("host scene failed to load")]);
  });

  it("applies inputs in arrival order before the tick and drops ones failing the inputSchema", async () => {
    const { runtime, handle, play, vip, second, time, warnings } = setup();
    play();
    await settle();
    handle(inputMessage(second, { type: "say", payload: { text: "one" } }));
    handle(inputMessage(vip, { type: "say", payload: { text: 2 } }));
    handle(inputMessage(vip, { type: "say", payload: { text: "two" } }));
    time.advance(17);

    expect(echoState(runtime).log.map((entry) => entry.split("@")[0])).toEqual([
      `${second}:say`,
      `${vip}:say`,
      "tick",
    ]);
    expect(warnings).toEqual([expect.stringContaining(`dropped input "say" from ${vip}`)]);
  });

  it("sends at most one controller:state per tick and no more than 1.5 per second", async () => {
    const { handle, play, vip, time, ofType } = setup();
    play();
    await settle();
    const beforeGame = ofType("controller:state").length;
    // A new view every tick for 6 seconds.
    for (let tick = 0; tick < 360; tick++) {
      handle(inputMessage(vip, { type: "say", payload: { text: String(tick) } }));
      const before = ofType("controller:state").length;
      time.advance(1000 / 60);
      expect(ofType("controller:state").length - before).toBeLessThanOrEqual(1);
    }
    expect(ofType("controller:state").length - beforeGame).toBeLessThanOrEqual(
      1 + Math.ceil(6000 / 667),
    );
  });

  it("shows the results screen to every seated phone when the game has an outcome", async () => {
    const { runtime, handle, play, vip, second, lobby, time, ofType, stageLog, changes } = setup();
    const third = lobby.players[2]!.id;
    play();
    await settle();
    time.advance(1000);
    handle(inputMessage(second, { type: "end" }));
    time.advance(17);

    expect(runtime.running).toBeNull();
    expect(stageLog).toEqual(["start echo 3", "stop echo"]);
    // Menu opened, game picked, game started, game ended.
    expect(changes()).toBe(4);
    expect(runtime.phase).toBe("results");
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual([
      "menu",
      "playing",
      "results",
    ]);
    // echoGame ties every player at place 1 once it ends (test/runtime/fixtures.ts).
    expect(runtime.results).toMatchObject({
      headline: "It's a tie!",
      canPlayAgain: true,
      hint: null,
    });
    expect(runtime.results?.standings.map((entry) => entry.player.id)).toEqual([
      vip,
      second,
      third,
    ]);

    const last = ofType("controller:state").at(-1);
    const vipName = lobby.players[0]!.name;
    expect(last?.d).toEqual({
      gameId: null,
      views: [
        {
          to: [vip],
          view: {
            screen: "results",
            data: {
              title: "Echo",
              vipName,
              place: 1,
              of: 3,
              vip: { canPlayAgain: true, hint: null },
            },
          },
        },
        {
          to: [second, third],
          view: { screen: "results", data: { title: "Echo", vipName, place: 1, of: 3 } },
        },
      ],
    });

    // The loop is stopped: nothing ticks or sends any more without a presence change.
    const count = ofType("controller:state").length;
    time.advance(5000);
    expect(ofType("controller:state")).toHaveLength(count);
  });

  it("ignores results actions from anyone but the VIP", async () => {
    const { runtime, handle, play, second, time } = setup();
    play();
    await settle();
    handle(inputMessage(second, { type: "end" }));
    time.advance(17);

    handle(playAgainAction(second));
    handle(backAction(second));
    expect(runtime.phase).toBe("results");
    expect(runtime.running).toBeNull();
  });

  it("play-again restarts the same game with a new seed and the currently seated players", async () => {
    const { runtime, handle, play, vip, time, ofType } = setup();
    play();
    await settle();
    handle(inputMessage(vip, { type: "end" }));
    time.advance(17);
    expect(runtime.phase).toBe("results");

    handle(playAgainAction(vip));
    await settle();

    expect(runtime.phase).toBe("playing");
    expect(runtime.results).toBeNull();
    expect(runtime.running?.game.id).toBe("echo");
    expect(echoState(runtime).players).toHaveLength(3);
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual([
      "menu",
      "playing",
      "results",
      "playing",
    ]);
  });

  it("back-to-menu from results reopens the menu for the VIP", async () => {
    const { runtime, handle, play, vip, second, time, ofType } = setup();
    play();
    await settle();
    handle(inputMessage(second, { type: "end" }));
    time.advance(17);
    expect(runtime.phase).toBe("results");

    handle(backAction(vip));
    expect(runtime.phase).toBe("menu");
    expect(runtime.results).toBeNull();
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual([
      "menu",
      "playing",
      "results",
      "menu",
    ]);
  });

  it("recomputes canPlayAgain when the seated count changes during results", async () => {
    const { runtime, handle, play, second, lobby, time } = setup({
      games: [echoGame({ min: 3, max: 3 })],
    });
    play();
    await settle();
    handle(inputMessage(second, { type: "end" }));
    time.advance(17);
    expect(runtime.results?.canPlayAgain).toBe(true);

    // A seat kept for a dropped phone still counts (session-flow.md), so the seat must actually
    // free up (the player left for good) to bring the fit below 3.
    const dropped = { ...lobby, players: lobby.players.filter((p) => p.id !== second) };
    handle({ t: "player:left", d: { id: second, reason: "left" } }, dropped);
    expect(runtime.results?.canPlayAgain).toBe(false);
    expect(runtime.results?.hint).toBe("Echo needs 3 players");
    expect(runtime.results?.headline).toBe("It's a tie!");
  });

  it("syncs the host to the room clock on welcome and judges inputs on game time", async () => {
    const { runtime, handle, play, time, vip, ofType } = setup();
    handle({ t: "room:welcome", d: { role: "host", code: "BEAN", phase: "lobby", locked: false } });
    const [ping] = ofType("clock:ping");
    expect(ping).toBeDefined();
    handle(pong(ping!.d));
    for (let i = 1; i < 5; i++) {
      time.advance(200);
      handle(pong(ofType("clock:ping")[i]!.d));
    }

    play();
    await settle();
    const startRoomTime = time.now() + 3000;
    time.advance(1000);
    handle(inputMessage(vip, { type: "say", payload: { text: "now" }, at: startRoomTime + 990 }));
    time.advance(17);
    expect(echoState(runtime).log.find((entry) => entry.includes("@"))).toMatch(
      new RegExp(`^${vip}:say@990/`),
    );
  });

  it("puts the room back in the lobby when the relay says a game runs but this TV has none", () => {
    const { handle, ofType, lobby } = setup();
    handle(
      { t: "room:welcome", d: { role: "host", code: "BEAN", phase: "playing", locked: false } },
      { ...lobby, phase: "playing", players: [] },
    );
    expect(ofType("room:phase")).toEqual([{ t: "room:phase", d: { phase: "lobby" } }]);

    handle({ t: "player:joined", d: { player: lobby.players[0]! } });
    expect(ofType("controller:state").at(-1)?.d.gameId).toBeNull();
  });

  it("keeps the menu open when its socket reconnects, and tells the relay if it forgot", () => {
    const { runtime, handle, vip, ofType } = setup();
    handle(startAction(vip));
    handle(welcome("menu"));
    expect(ofType("room:phase")).toHaveLength(1);
    handle(welcome("lobby"));
    expect(ofType("room:phase").at(-1)).toEqual({ t: "room:phase", d: { phase: "menu" } });
    expect(runtime.phase).toBe("menu");
  });

  it("stops the countdown, the loop and the scene on dispose", () => {
    const { runtime, handle, vip, time } = setup();
    handle(pickAction(vip));
    expect(runtime.menu?.countdown?.gameId).toBe("echo");
    runtime.dispose();
    time.advance(countdownMs);
    expect(runtime.running).toBeNull();
    expect(time.pending).toBe(0);
  });

  it("stops the loop and the scene on dispose", async () => {
    const { runtime, play, time, stageLog } = setup();
    play();
    await settle();
    runtime.dispose();
    expect(stageLog.at(-1)).toBe("stop echo");
    expect(runtime.running).toBeNull();
    time.advance(1000);
    expect(time.pending).toBe(0);
  });
});
