import { createRoomClock, type StoredDisplayLag } from "@couchcade/game-sdk/clock";
import type { CouchcadeGame } from "@couchcade/game-sdk/contract";
import { createRegistry } from "@couchcade/game-sdk/registry";
import type { HostToRelayMessage, RelayToHostMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { motionWaitMs } from "../../src/motion/motion-check.ts";
import { countdownMs } from "../../src/screens/menu/menu.ts";
import { createHostRuntime, type DisplayLagStore } from "../../src/runtime/host-runtime.ts";
import {
  beatMs,
  flashMs,
  practiceFlashes,
  settleMs,
  totalFlashes,
} from "../../src/screens/calibration/calibration.ts";
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

function setup({
  games = [echoGame()] as CouchcadeGame[],
  sceneFails = false,
  storedLag = null as StoredDisplayLag | null,
} = {}) {
  const time = createVirtualTime(1_000_000);
  const sent: HostToRelayMessage[] = [];
  const warnings: string[] = [];
  const stageLog: string[] = [];
  const sceneLag: number[] = [];
  let stored = storedLag;
  const displayLag: DisplayLagStore = {
    ms: () => stored?.ms ?? 0,
    read: () => stored,
    save: (ms) => {
      stored = { ms, measuredAt: 42 };
    },
  };
  let changes = 0;
  const stage: GameStage = {
    start: (game, data) => {
      stageLog.push(`start ${game.id} ${data.players.length}`);
      sceneLag.push(data.displayLagMs);
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
    displayLag,
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
    sceneLag,
    stored: () => stored,
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

  it("re-sends a reconnected phone its lobby view, even though it didn't change", () => {
    const { handle, second, lobby, ofType, time } = setup();
    handle({ t: "player:joined", d: { player: lobby.players[2]! } });
    const before = ofType("controller:state").length;
    handle({ t: "player:reconnected", d: { id: second } });
    time.advance(667);
    expect(ofType("controller:state")).toHaveLength(before + 1);
    expect(ofType("controller:state").at(-1)?.d.views).toEqual([
      { to: [second], view: { screen: "lobby", data: { vip: false } } },
    ]);
  });

  it("re-sends a reconnected phone its game view within the send cap, and the game isn't told", async () => {
    const games = [echoGame({ leaves: true })];
    const { runtime, handle, play, second, lobby, ofType, time } = setup({ games });
    play();
    await settle();
    time.advance(1000);

    const away = {
      ...lobby,
      players: lobby.players.map((p) => (p.id === second ? { ...p, connected: false } : p)),
    };
    handle({ t: "player:left", d: { id: second, reason: "disconnected" } }, away);
    time.advance(1000);
    expect(echoState(runtime).log.filter((entry) => entry.endsWith(":left"))).toEqual([]);
    const before = ofType("controller:state").length;

    handle({ t: "player:reconnected", d: { id: second } });
    time.advance(1000 / 60);
    expect(ofType("controller:state")).toHaveLength(before + 1);
    expect(ofType("controller:state").at(-1)?.d).toEqual({
      gameId: "echo",
      views: [{ to: [second], view: { screen: "echo", data: { text: "" } } }],
    });
    time.advance(1000);
    expect(ofType("controller:state")).toHaveLength(before + 1);
  });

  it("calls onPlayerLeft when a seat is freed mid-game and ends the game when it says so", async () => {
    const games = [echoGame({ leaves: true })];
    const { runtime, handle, play, vip, second, lobby, time } = setup({ games });
    const third = lobby.players[2]!.id;
    play();
    await settle();

    handle({ t: "player:left", d: { id: second, reason: "expired" } });
    time.advance(1000 / 60);
    expect(echoState(runtime).log.filter((entry) => entry.endsWith(":left"))).toEqual([
      `${second}:left`,
    ]);
    expect(runtime.phase).toBe("playing");
    handle(inputMessage(second, { type: "end" }));
    time.advance(1000 / 60);
    expect(runtime.phase).toBe("playing");

    handle({ t: "player:left", d: { id: third, reason: "left" } });
    time.advance(1000 / 60);
    expect(runtime.phase).toBe("results");
    expect(runtime.results?.standings.map((standing) => standing.player.id)).toContain(vip);
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

const skipAction = (from: string): RelayToHostMessage => ({
  t: "ui:action",
  from,
  d: { action: "skip-calibration" },
});

const tapMessage = (from: string, at: number): RelayToHostMessage => ({
  t: "calibration:tap",
  from,
  d: { at },
});

describe("TV lag calibration", () => {
  /** Opens the check from the TV lobby once the host knows its players. */
  function inCalibration(options: Parameters<typeof setup>[0] = {}) {
    const rig = setup(options);
    rig.handle({ t: "player:joined", d: { player: rig.lobby.players[2]! } });
    rig.runtime.checkTvLag();
    return rig;
  }

  /** Draws the flashes at 60 Hz and taps along for every seated player, `lagMs` after each. */
  function tapAlong(rig: ReturnType<typeof inCalibration>, lagMs: number) {
    const { runtime, handle, lobby, time } = rig;
    const startsAt = runtime.calibration!.startsAt;
    const drawn: number[] = [];
    for (let at = time.now(); at <= startsAt + totalFlashes * beatMs; at += 1000 / 60) {
      const frame = runtime.calibrationFrame(Math.round(at));
      if (frame?.lit && drawn[frame.index] === undefined) drawn[frame.index] = Math.round(at);
    }
    for (let index = practiceFlashes; index < totalFlashes; index++) {
      for (const player of lobby.players) handle(tapMessage(player.id, drawn[index]! + lagMs));
    }
    return startsAt + (totalFlashes - 1) * beatMs + flashMs + settleMs;
  }

  it("starts from the TV lobby: phase calibration and the tap button on every seated phone", () => {
    const { runtime, ofType, vip, second, lobby, changes, time } = inCalibration();
    time.advance(667);
    expect(runtime.phase).toBe("calibration");
    expect(runtime.calibration?.status).toBe("running");
    expect(changes()).toBeGreaterThan(0);
    expect(ofType("room:phase")).toEqual([{ t: "room:phase", d: { phase: "calibration" } }]);
    expect(ofType("controller:state").at(-1)?.d).toEqual({
      gameId: null,
      views: [
        { to: [vip], view: { screen: "calibration", data: { vip: true, active: true } } },
        {
          to: [second, lobby.players[2]!.id],
          view: { screen: "calibration", data: { vip: false, active: true } },
        },
      ],
    });
  });

  it("stores the median offset, goes back to the lobby and games get it as displayLagMs", async () => {
    const rig = inCalibration();
    const { runtime, time, ofType, stored, handle, vip, sceneLag } = rig;
    const endsAt = tapAlong(rig, 120);
    expect(runtime.calibration?.measurement.lagMs).toBe(120);
    // The VIP's menu buttons do nothing during the check.
    handle(startAction(vip));
    expect(runtime.phase).toBe("calibration");

    time.advance(endsAt - time.now());
    expect(stored()).toEqual({ ms: 120, measuredAt: 42 });
    expect(runtime.phase).toBe("lobby");
    expect(runtime.calibration).toBeNull();
    expect(runtime.displayLag).toEqual({ ms: 120, measuredAt: 42 });
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual([
      "calibration",
      "lobby",
    ]);
    time.advance(1000);
    expect(ofType("controller:state").at(-1)?.d.views[0]?.view.screen).toBe("lobby");

    rig.play();
    await settle();
    expect(sceneLag).toEqual([120]);
  });

  it("passes 0 to games on a TV that was never calibrated", async () => {
    const { play, sceneLag, runtime } = setup();
    expect(runtime.displayLag).toBeNull();
    play();
    await settle();
    expect(sceneLag).toEqual([0]);
  });

  it("skips on the VIP's skip-calibration and on the TV's Skip, keeping the old value", () => {
    const old = { ms: 80, measuredAt: 1 };
    const rig = inCalibration({ storedLag: old });
    rig.handle(skipAction(rig.second));
    expect(rig.runtime.phase).toBe("calibration");
    rig.handle(skipAction(rig.vip));
    expect(rig.runtime.phase).toBe("lobby");
    rig.time.advance(20_000);
    expect(rig.stored()).toBe(old);
    expect(rig.time.pending).toBe(0);

    const tv = inCalibration({ storedLag: old });
    tapAlong(tv, 200);
    tv.runtime.skipCalibration();
    tv.time.advance(20_000);
    expect(tv.runtime.phase).toBe("lobby");
    expect(tv.stored()).toBe(old);
    expect(tv.ofType("room:phase").map((message) => message.d.phase)).toEqual([
      "calibration",
      "lobby",
    ]);
  });

  it("offers Try again when nobody got 3 taps in, and runs the flashes again", () => {
    const { runtime, time, stored, ofType } = inCalibration();
    time.advance(10_000);
    expect(runtime.phase).toBe("calibration");
    expect(runtime.calibration?.status).toBe("retry");
    expect(stored()).toBeNull();
    time.advance(1000);
    expect(ofType("controller:state").at(-1)?.d.views[0]?.view.data).toEqual({
      vip: true,
      active: false,
    });
    runtime.retryCalibration();
    expect(runtime.calibration?.status).toBe("running");
  });

  it("only starts from the lobby", () => {
    const { runtime, handle, vip, ofType } = setup();
    handle(startAction(vip));
    runtime.checkTvLag();
    expect(runtime.phase).toBe("menu");
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual(["menu"]);
  });
});

const motionStatus = (
  from: string,
  status: "granted" | "denied" | "unsupported",
): RelayToHostMessage => ({ t: "motion:status", from, d: { status } });

const motionGame = () =>
  ({ ...echoGame({ id: "swing" }), title: "Swing", needsMotion: true }) as CouchcadeGame;

describe("motion step", () => {
  it("runs the motion step before a game that needs motion, then starts it once every phone answered", async () => {
    const { runtime, handle, play, lobby, ofType, time, stageLog, changes } = setup({
      games: [motionGame()],
    });
    const [a, b, c] = lobby.players.map((player) => player.id) as [string, string, string];
    play("swing");

    expect(runtime.phase).toBe("motion-check");
    expect(runtime.running).toBeNull();
    expect(runtime.menu).toBeNull();
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual([
      "menu",
      "motion-check",
    ]);
    time.advance(667);
    expect(ofType("controller:state").at(-1)?.d).toEqual({
      gameId: null,
      views: [
        {
          to: [a, b, c],
          view: { screen: "motion-permission", data: { gameId: "swing", title: "Swing", step: 1 } },
        },
      ],
    });
    expect(runtime.motion?.players.map(({ state }) => state)).toEqual([
      "waiting",
      "waiting",
      "waiting",
    ]);

    // Platform actions don't count during the step.
    handle(startAction(a));
    expect(runtime.phase).toBe("motion-check");

    const before = changes();
    handle(motionStatus(a, "granted"));
    handle(motionStatus(b, "denied"));
    expect(changes()).toBe(before + 2);
    expect(runtime.motion?.players.map(({ state }) => state)).toEqual([
      "motion",
      "touch",
      "waiting",
    ]);
    handle(motionStatus(c, "unsupported"));
    await settle();

    expect(runtime.phase).toBe("playing");
    expect(runtime.motion).toBeNull();
    expect(runtime.running?.game.id).toBe("swing");
    expect([...(runtime.running?.touchPlayers ?? [])]).toEqual([b, c]);
    expect(stageLog).toEqual(["start swing 3"]);
  });

  it("starts after 20 seconds with the phones that never answered on touch", () => {
    const { runtime, handle, play, lobby, time } = setup({ games: [motionGame()] });
    const [a, b, c] = lobby.players.map((player) => player.id) as [string, string, string];
    play("swing");
    handle(motionStatus(a, "granted"));
    time.advance(motionWaitMs - 1);
    expect(runtime.phase).toBe("motion-check");
    time.advance(1);
    expect(runtime.phase).toBe("playing");
    expect([...(runtime.running?.touchPlayers ?? [])]).toEqual([b, c]);
  });

  it("starts at once when the last phone the step waited for leaves", () => {
    const { runtime, handle, play, lobby } = setup({ games: [motionGame()] });
    const [a, b, c] = lobby.players.map((player) => player.id) as [string, string, string];
    play("swing");
    handle(motionStatus(a, "granted"));
    handle(motionStatus(b, "granted"));
    const left = { ...lobby, players: lobby.players.filter((player) => player.id !== c) };
    handle({ t: "player:left", d: { id: c, reason: "expired" } }, left);
    expect(runtime.phase).toBe("playing");
    expect(runtime.running?.runner.players.map((player) => player.id)).toEqual([a, b]);
    expect(runtime.running?.touchPlayers.size).toBe(0);
  });

  it("goes back to the menu when too few players are left once the step ends", () => {
    const game = {
      ...echoGame({ id: "swing", min: 3 }),
      title: "Swing",
      needsMotion: true,
    } as CouchcadeGame;
    const { runtime, handle, play, lobby, time } = setup({ games: [game] });
    const [a, b, c] = lobby.players.map((player) => player.id) as [string, string, string];
    play("swing");
    handle(motionStatus(b, "granted"));
    const left = { ...lobby, players: lobby.players.filter((player) => player.id !== c) };
    handle({ t: "player:left", d: { id: c, reason: "kicked" } }, left);
    handle(motionStatus(a, "granted"), left);
    time.advance(1000);
    expect(runtime.running).toBeNull();
    expect(runtime.phase).toBe("menu");
    expect(runtime.menu?.games.map(({ fits }) => fits)).toEqual([false]);
  });

  it("marks a player whose sensors stopped mid-game as touch, and asks again on play again", async () => {
    const { runtime, handle, play, lobby, time, ofType } = setup({ games: [motionGame()] });
    const ids = lobby.players.map((player) => player.id) as [string, string, string];
    play("swing");
    for (const id of ids) handle(motionStatus(id, "granted"));
    await settle();
    expect(runtime.running?.touchPlayers.size).toBe(0);

    handle(motionStatus(ids[1], "unsupported"));
    expect([...(runtime.running?.touchPlayers ?? [])]).toEqual([ids[1]]);
    handle(motionStatus("NOTINGAME", "unsupported"));
    expect(runtime.running?.touchPlayers.size).toBe(1);

    handle(inputMessage(ids[0], { type: "end" }));
    time.advance(17);
    expect(runtime.phase).toBe("results");
    handle(playAgainAction(ids[0]));
    expect(runtime.phase).toBe("motion-check");
    time.advance(667);
    expect(ofType("controller:state").at(-1)?.d.views[0]?.view.data).toEqual({
      gameId: "swing",
      title: "Swing",
      step: 2,
    });
  });

  it("cancels the 20 second wait on dispose", () => {
    const { runtime, play, time } = setup({ games: [motionGame()] });
    play("swing");
    runtime.dispose();
    time.advance(motionWaitMs);
    expect(runtime.running).toBeNull();
    expect(time.pending).toBe(0);
  });
});
