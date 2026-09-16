import { createRoomClock } from "@couchcade/game-sdk/clock";
import type { CouchcadeGame } from "@couchcade/game-sdk/contract";
import { createRegistry } from "@couchcade/game-sdk/registry";
import type { HostToRelayMessage, RelayToHostMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { createHostRuntime } from "../../src/runtime/host-runtime.ts";
import type { GameStage } from "../../src/runtime/stage.ts";
import {
  createVirtualTime,
  echoGame,
  inputMessage,
  lobbyWith,
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

const echoState = (runtime: ReturnType<typeof setup>["runtime"]) =>
  runtime.running?.runner.state as EchoState;

describe("createHostRuntime", () => {
  it("lets only the VIP start a game", () => {
    const { runtime, handle, second, vip, sent } = setup();
    handle(startAction(second));
    expect(runtime.running).toBeNull();
    expect(sent).toEqual([]);

    handle(startAction(vip));
    expect(runtime.running?.game.id).toBe("echo");
  });

  it("starts the first registered game with the seated players and a seed", async () => {
    const games = [echoGame({ id: "zebra" }), echoGame({ id: "aardvark" })];
    const { runtime, handle, vip, lobby, ofType, stageLog, changes } = setup({ games });
    handle(startAction(vip));
    await settle();

    expect(runtime.running?.game.id).toBe("aardvark");
    expect(echoState(runtime).players).toEqual(lobby.players.map((player) => player.id));
    expect(echoState(runtime).seed).toBe(7);
    expect(ofType("room:phase")).toEqual([{ t: "room:phase", d: { phase: "playing" } }]);
    expect(ofType("controller:state")[0]?.d.gameId).toBe("aardvark");
    expect(stageLog).toEqual(["start aardvark 3"]);
    expect(changes()).toBe(1);
  });

  it("ignores start while a game runs, with no games, or when the player count doesn't fit", () => {
    const empty = setup({ games: [] });
    empty.handle(startAction(empty.vip));
    expect(empty.runtime.running).toBeNull();
    expect(empty.warnings).toEqual(["no games registered"]);

    const tooFew = setup({ games: [echoGame({ min: 4 })] });
    tooFew.handle(startAction(tooFew.vip));
    expect(tooFew.runtime.running).toBeNull();
    expect(tooFew.sent).toEqual([]);

    const busy = setup();
    busy.handle(startAction(busy.vip));
    const runner = busy.runtime.running?.runner;
    busy.handle(startAction(busy.vip));
    expect(busy.runtime.running?.runner).toBe(runner);
    expect(busy.ofType("room:phase")).toHaveLength(1);
  });

  it("ticks at a fixed 60 Hz once the scene has loaded", async () => {
    const { runtime, handle, vip, time } = setup();
    handle(startAction(vip));
    time.advance(500);
    expect(runtime.running?.runner.tick).toBe(0);

    await settle();
    time.advance(1001);
    expect(runtime.running?.runner.tick).toBe(60);
    time.advance(2000);
    expect(runtime.running?.runner.tick).toBe(180);
  });

  it("still runs the game when the scene fails to load, with a warning", async () => {
    const { runtime, handle, vip, time, warnings } = setup({ sceneFails: true });
    handle(startAction(vip));
    await settle();
    time.advance(1001);
    expect(runtime.running?.runner.tick).toBe(60);
    expect(warnings).toEqual([expect.stringContaining("host scene failed to load")]);
  });

  it("applies inputs in arrival order before the tick and drops ones failing the inputSchema", async () => {
    const { runtime, handle, vip, second, time, warnings } = setup();
    handle(startAction(vip));
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
    const { handle, vip, time, ofType } = setup();
    handle(startAction(vip));
    await settle();
    // A new view every tick for 6 seconds.
    for (let tick = 0; tick < 360; tick++) {
      handle(inputMessage(vip, { type: "say", payload: { text: String(tick) } }));
      const before = ofType("controller:state").length;
      time.advance(1000 / 60);
      expect(ofType("controller:state").length - before).toBeLessThanOrEqual(1);
    }
    expect(ofType("controller:state").length).toBeLessThanOrEqual(1 + Math.ceil(6000 / 667));
  });

  it("returns host and phones to the lobby when the game has an outcome", async () => {
    const { runtime, handle, vip, second, time, ofType, stageLog, changes, lobby } = setup();
    handle(startAction(vip));
    await settle();
    time.advance(1000);
    handle(inputMessage(second, { type: "end" }));
    time.advance(17);

    expect(runtime.running).toBeNull();
    expect(stageLog).toEqual(["start echo 3", "stop echo"]);
    expect(changes()).toBe(2);
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual(["playing", "lobby"]);

    time.advance(1000);
    const last = ofType("controller:state").at(-1);
    expect(last?.d).toEqual({
      gameId: null,
      views: [
        { to: lobby.players.map((player) => player.id), view: { screen: "lobby", data: null } },
      ],
    });

    // The loop is stopped: nothing ticks or sends any more.
    const count = ofType("controller:state").length;
    time.advance(5000);
    expect(ofType("controller:state")).toHaveLength(count);
  });

  it("syncs the host to the room clock on welcome and judges inputs on game time", async () => {
    const { runtime, handle, vip, time, ofType } = setup();
    handle({ t: "room:welcome", d: { role: "host", code: "BEAN", phase: "lobby", locked: false } });
    const [ping] = ofType("clock:ping");
    expect(ping).toBeDefined();
    handle(pong(ping!.d));
    for (let i = 1; i < 5; i++) {
      time.advance(200);
      handle(pong(ofType("clock:ping")[i]!.d));
    }

    handle(startAction(vip));
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

  it("stops the loop and the scene on dispose", async () => {
    const { runtime, handle, vip, time, stageLog } = setup();
    handle(startAction(vip));
    await settle();
    runtime.dispose();
    expect(stageLog.at(-1)).toBe("stop echo");
    expect(runtime.running).toBeNull();
    time.advance(1000);
    expect(time.pending).toBe(0);
  });
});
