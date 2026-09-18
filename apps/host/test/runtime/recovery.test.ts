import { createRoomClock } from "@couchcade/game-sdk/clock";
import { defineGame, type CouchcadeGame, type Player } from "@couchcade/game-sdk/contract";
import type {
  HostToRelayMessage,
  JsonValue,
  RelayToHostMessage,
  RoomPhase,
} from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import type { GameRunner } from "../../src/runtime/game-runner.ts";
import { createHostRuntime, type HostRuntime } from "../../src/runtime/host-runtime.ts";
import {
  createSnapshotSender,
  planRecovery,
  snapshotMinGapMs,
  tvRestartedNotice,
  type RoomSnapshot,
} from "../../src/runtime/recovery.ts";
import type { GameStage } from "../../src/runtime/stage.ts";
import { countdownMs } from "../../src/screens/menu/menu.ts";
import {
  createVirtualTime,
  echoGame,
  fakeGameRegistry,
  fakeMetaRegistry,
  inputMessage,
  lobbyWith,
  pickAction,
  startAction,
  type EchoState,
} from "./fixtures.ts";

// docs/architecture/session-flow.md, "Host refresh and deploy recovery".

/**
 * Echo with rounds: its snapshot is what players said, so it changes when someone speaks, and
 * `restore` puts that back with a fresh log.
 */
function roundsGame({ id = "rounds", min = 1 } = {}) {
  const echo = echoGame({ id, min });
  return defineGame({
    ...echo,
    snapshot: (state: EchoState): JsonValue => ({ said: state.said }),
    restore(players: readonly Player[], seed: number, data: JsonValue): EchoState {
      const said = (data as { said?: Record<string, string> } | null)?.said ?? {};
      return { ...echo.init(players, seed), said, log: ["restored"] };
    },
  });
}

const hugeGame = () =>
  defineGame({
    ...roundsGame({ id: "huge" }),
    snapshot: (state: EchoState): JsonValue => ({ pad: "x".repeat(700), said: state.said }),
  });

// ---- The recovery table ---------------------------------------------------------------------

const snapshotData = (p: string[]) => ({ p, t: 9000, g: { said: {} } });
const roomSnapshot = (gameId: string | null, d: JsonValue, round = 3): RoomSnapshot => ({
  round,
  gameId,
  data: d,
});

describe("planRecovery", () => {
  const players = lobbyWith(3).players;
  const gameRegistry = fakeGameRegistry([roundsGame({ id: "rounds", min: 2 }), echoGame()]);
  const plan = (phase: RoomPhase, saved: RoomSnapshot | null, seated = players) =>
    planRecovery({ phase, snapshot: saved, gameRegistry, seated });
  const ids = players.map((player) => player.id);

  it("resumes a restorable game with the in-game players still seated, in init order", async () => {
    const result = await plan(
      "playing",
      roomSnapshot("rounds", snapshotData([ids[2]!, ids[0]!, "GONEGONE"])),
    );
    expect(result).toMatchObject({ to: "playing", resume: { round: 3, g: { said: {} } } });
    if (result.to !== "playing") throw new Error("expected a restore");
    expect(result.game.id).toBe("rounds");
    expect(result.players.map((player) => player.id)).toEqual([ids[2], ids[0]]);
  });

  it("ends the game with a notice when it can't resume", async () => {
    const ended = { to: "menu", notice: tvRestartedNotice };
    // No snapshot, a game without snapshots, an unknown game, data that isn't SnapshotData.
    await expect(plan("playing", null)).resolves.toEqual(ended);
    await expect(plan("playing", roomSnapshot("echo", null, 0))).resolves.toEqual(ended);
    await expect(plan("playing", roomSnapshot("nope", snapshotData(ids)))).resolves.toEqual(ended);
    await expect(plan("playing", roomSnapshot("rounds", { said: {} }))).resolves.toEqual(ended);
    await expect(plan("playing", roomSnapshot(null, null))).resolves.toEqual(ended);
    // Fewer in-game players left than the game needs.
    await expect(
      plan("playing", roomSnapshot("rounds", snapshotData([ids[0]!, "GONEGONE"]))),
    ).resolves.toEqual(ended);
  });

  it("goes to the menu from menu, motion-check and results, and to the lobby otherwise", async () => {
    const saved = roomSnapshot("rounds", snapshotData(ids));
    for (const phase of ["menu", "motion-check", "results"] as const) {
      await expect(plan(phase, saved)).resolves.toEqual({ to: "menu", notice: null });
    }
    for (const phase of ["lobby", "calibration"] as const) {
      await expect(plan(phase, saved)).resolves.toEqual({ to: "lobby" });
    }
  });
});

// ---- Sending snapshots ----------------------------------------------------------------------

describe("createSnapshotSender", () => {
  function rig(game: CouchcadeGame = roundsGame(), resume?: { round: number; g: JsonValue }) {
    const time = createVirtualTime(50_000);
    const players = lobbyWith(2).players;
    const runner = {
      players,
      state: game.init(players, 1),
      tick: 0,
    } as unknown as GameRunner & { state: EchoState; tick: number };
    const sent: Array<Extract<HostToRelayMessage, { t: "room:snapshot" }>> = [];
    const sentAt: number[] = [];
    const warnings: string[] = [];
    const sender = createSnapshotSender({
      game,
      runner,
      send: (message) => {
        sent.push(message);
        sentAt.push(time.now());
      },
      now: time.now,
      schedule: time.schedule,
      warn: (message) => warnings.push(message),
      resume,
    });
    /** Runs `count` ticks, 1000 / 60 ms apart, calling the sender after each. */
    const ticks = (count: number) => {
      for (let i = 0; i < count; i++) {
        runner.tick += 1;
        time.advance(1000 / 60);
        sender.tick();
      }
    };
    const say = (text: string) => {
      runner.state = { ...runner.state, said: { ...runner.state.said, [players[0]!.id]: text } };
    };
    return { time, runner, sent, sentAt, warnings, sender, ticks, say, players };
  }

  it("sends round 0 at the start with the in-game players, game time and the game's snapshot", () => {
    const { sent, players } = rig();
    expect(sent).toEqual([
      {
        t: "room:snapshot",
        d: {
          round: 0,
          gameId: "rounds",
          data: { p: players.map((p) => p.id), t: 0, g: { said: {} } },
        },
      },
    ]);
    // A game without snapshots still replaces the last game's snapshot, with null.
    expect(rig(echoGame()).sent).toEqual([
      { t: "room:snapshot", d: { round: 0, gameId: "echo", data: null } },
    ]);
  });

  it("sends a changed snapshot with the next round, checked every 30 ticks, at most once per 5 s", () => {
    const { sent, sentAt, ticks, say, players } = rig();
    // Nothing changes: nothing is sent.
    ticks(600);
    expect(sent).toHaveLength(1);

    say("one");
    ticks(29);
    expect(sent).toHaveLength(1);
    ticks(1);
    expect(sent.at(-1)?.d).toEqual({
      round: 1,
      gameId: "rounds",
      data: {
        p: players.map((p) => p.id),
        t: 630_000 / 60,
        g: { said: { [players[0]!.id]: "one" } },
      },
    });

    // Two changes inside the window: only the latest goes out, when the window opens.
    ticks(60);
    say("two");
    ticks(60);
    say("three");
    ticks(60);
    expect(sent).toHaveLength(2);
    ticks(Math.ceil((snapshotMinGapMs / 1000) * 60));
    expect(sent).toHaveLength(3);
    expect(sent.at(-1)?.d.round).toBe(2);
    expect(JSON.stringify(sent.at(-1)?.d.data)).toContain("three");
    expect(sentAt[2]! - sentAt[1]!).toBeCloseTo(snapshotMinGapMs, 6);
  });

  it("sends nothing more once stopped, even a change waiting for its window", () => {
    const { sent, ticks, say, sender } = rig();
    // Round 0 just went out, so this change waits for the window.
    say("one");
    ticks(30);
    sender.stop();
    ticks(600);
    expect(sent.map((message) => message.d.round)).toEqual([0]);
  });

  it("skips a game snapshot over 600 bytes with one dev warning", () => {
    const { sent, warnings, ticks, say } = rig(hugeGame());
    expect(sent).toEqual([{ t: "room:snapshot", d: { round: 0, gameId: "huge", data: null } }]);
    ticks(120);
    say("one");
    ticks(600);
    expect(sent).toHaveLength(1);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^huge snapshot is 7\d\d bytes, over the 600 byte limit, skipped$/);
  });

  it("keeps a restored game's stored snapshot and counts on from its round", () => {
    const { sent, ticks, say } = rig(roundsGame(), { round: 3, g: { said: {} } });
    ticks(600);
    expect(sent).toEqual([]);
    say("one");
    ticks(30);
    expect(sent.map((message) => message.d.round)).toEqual([4]);
  });
});

// ---- The host runtime -----------------------------------------------------------------------

/** Lets the fake scene load: ticking starts after it, in a later task. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const snapshotOf = (p: string[], said: Record<string, string>, round = 2): RoomSnapshot => ({
  round,
  gameId: "rounds",
  data: { p, t: 20_000, g: { said } },
});

const state = (runtime: HostRuntime) => runtime.running?.runner.state as EchoState;

describe("host runtime recovery", () => {
  function setup(games: CouchcadeGame[] = [roundsGame()]) {
    const time = createVirtualTime(2_000_000);
    const sent: HostToRelayMessage[] = [];
    const stageLog: string[] = [];
    const stage: GameStage = {
      start: (game, data) => {
        stageLog.push(`start ${game.id} ${data.players.map((p) => p.id).join(",")}`);
        return Promise.resolve();
      },
      stop: (game) => stageLog.push(`stop ${game.id}`),
    };
    const runtime = createHostRuntime({
      metaRegistry: fakeMetaRegistry(games),
      gameRegistry: fakeGameRegistry(games),
      stage,
      clock: createRoomClock({ now: time.now, schedule: time.schedule }),
      send: (message) => sent.push(message),
      now: time.now,
      schedule: time.schedule,
      createSeed: () => 11,
      warn: () => {},
      displayLag: { ms: () => 0, read: () => null, save: () => {} },
      origin: "https://couchcade.workers.dev",
    });
    const lobby = lobbyWith(3);
    const ids = lobby.players.map((player) => player.id) as [string, string, string];
    const handle = (message: RelayToHostMessage, known = lobby) => runtime.handle(message, known);
    const ofType = <T extends HostToRelayMessage["t"]>(t: T) =>
      sent.filter((message): message is Extract<HostToRelayMessage, { t: T }> => message.t === t);

    /** A new TV tab rejoins: welcome, the known players, and the stored snapshot if any. */
    const rejoin = (phase: RoomPhase, snapshot: RoomSnapshot | null) => {
      handle({ t: "room:welcome", d: { role: "host", code: "BEAN", phase, locked: false } });
      for (const player of lobby.players) handle({ t: "player:joined", d: { player } });
      if (snapshot) handle({ t: "room:snapshot", d: snapshot });
    };
    /** Answers the 5 clock pings of the burst, 200 ms apart. */
    const syncClock = async () => {
      const answered = new Set<number>();
      for (let sample = 0; sample < 5; sample++) {
        for (const ping of ofType("clock:ping")) {
          if (answered.has(ping.d.id)) continue;
          answered.add(ping.d.id);
          handle({ t: "clock:pong", d: { ...ping.d, t1: Math.round(ping.d.t0) } });
        }
        time.advance(200);
      }
      await settle();
    };
    return { time, sent, stageLog, runtime, lobby, ids, handle, ofType, rejoin, syncClock };
  }

  it("sends round 0 right after room:phase playing, then one snapshot when a round changes it", async () => {
    const { handle, ids, time, sent, runtime } = setup();
    handle(startAction(ids[0]));
    handle(pickAction(ids[0], "rounds"));
    time.advance(countdownMs);
    await settle();
    const types = sent.map((message) => message.t).filter((t) => t !== "controller:state");
    expect(types).toEqual(["room:phase", "room:phase", "room:snapshot"]);

    time.advance(1000);
    handle(inputMessage(ids[1], { type: "say", payload: { text: "hi" } }));
    time.advance(10_000);
    const snapshots = sent.filter((message) => message.t === "room:snapshot");
    expect(snapshots.map((message) => message.d.round)).toEqual([0, 1]);
    expect(snapshots[1]?.d.data).toMatchObject({ p: ids, g: { said: { [ids[1]]: "hi" } } });
    expect(runtime.running?.game.id).toBe("rounds");
  });

  it("resumes a refreshed game from the snapshot once its clock is synced", async () => {
    const { rejoin, syncClock, runtime, ofType, handle, ids, lobby, stageLog, time } = setup();
    const stored = snapshotOf([ids[1], ids[0]], { [ids[0]]: "kept" });
    rejoin("playing", stored);

    // Waiting for the clock: no game, no phase change, and the VIP's actions don't count.
    handle(startAction(ids[0]));
    expect(runtime.running).toBeNull();
    expect(runtime.menu).toBeNull();
    expect(ofType("room:phase")).toEqual([]);
    expect(ofType("controller:state")).toEqual([]);

    await syncClock();
    expect(runtime.phase).toBe("playing");
    expect(runtime.running?.game.id).toBe("rounds");
    // The in-game players from the snapshot, not the third seated player, with a new seed.
    expect(runtime.running?.runner.players.map((player) => player.id)).toEqual([ids[1], ids[0]]);
    expect(state(runtime)).toMatchObject({
      seed: 11,
      said: { [ids[0]]: "kept" },
      log: ["restored"],
    });
    expect(stageLog).toEqual([`start rounds ${ids[1]},${ids[0]}`]);
    // The relay is already in playing and keeps its snapshot.
    expect(ofType("room:phase")).toEqual([]);
    expect(ofType("room:snapshot")).toEqual([]);
    // Every in-game phone gets its view, and the seated player who wasn't in the game waits for the
    // next one (session-flow.md, "Recovery").
    const views = ofType("controller:state").flatMap((message) => message.d.views);
    expect(views.flatMap((entry) => entry.to).toSorted()).toEqual([...ids].toSorted());
    expect(views.find((entry) => entry.to.includes(ids[2]))?.view).toEqual({
      screen: "next-game",
      data: null,
    });

    // Game time starts at 0 again, like the game's restore.
    time.advance(1001);
    expect(runtime.running?.runner.tick).toBe(60);
    expect(lobby.players).toHaveLength(3);
  });

  it("goes to the menu with a notice when the game can't resume", async () => {
    for (const stored of [null, { round: 0, gameId: "rounds", data: null }]) {
      const { rejoin, syncClock, runtime, ofType, ids } = setup();
      rejoin("playing", stored);
      await syncClock();
      expect(runtime.running).toBeNull();
      expect(runtime.phase).toBe("menu");
      expect(runtime.menu?.notice).toBe(tvRestartedNotice);
      expect(ofType("room:phase")).toEqual([{ t: "room:phase", d: { phase: "menu" } }]);
      const vipView = ofType("controller:state")
        .flatMap((message) => message.d.views)
        .find((entry) => entry.to.includes(ids[0]));
      expect(vipView?.view.screen).toBe("menu");
    }
  });

  it("clears the notice once the VIP picks a game", async () => {
    const { rejoin, syncClock, runtime, handle, ids } = setup();
    rejoin("playing", null);
    await syncClock();
    handle(pickAction(ids[0], "rounds"));
    expect(runtime.menu?.notice).toBeNull();
    expect(runtime.menu?.countdown?.gameId).toBe("rounds");
  });

  it("comes back to the menu from menu, motion-check and results, and to the lobby from calibration", async () => {
    const cases: Array<[RoomPhase, "menu" | "lobby", RoomPhase[]]> = [
      ["menu", "menu", []],
      ["motion-check", "menu", ["menu"]],
      ["results", "menu", ["menu"]],
      ["calibration", "lobby", ["lobby"]],
    ];
    for (const [stored, expected, phaseMessages] of cases) {
      const { rejoin, syncClock, runtime, ofType } = setup();
      rejoin(stored, snapshotOf([], {}));
      await syncClock();
      expect({ stored, phase: runtime.phase }).toEqual({ stored, phase: expected });
      expect(runtime.menu?.notice ?? null).toBeNull();
      expect({ stored, sent: ofType("room:phase").map((message) => message.d.phase) }).toEqual({
        stored,
        sent: phaseMessages,
      });
    }
  });

  it("doesn't wait for the clock in the lobby", () => {
    const { rejoin, runtime, handle, ids } = setup();
    rejoin("lobby", null);
    handle(startAction(ids[0]));
    expect(runtime.phase).toBe("menu");
  });

  it("keeps a running game when only its socket reconnects, and ignores the snapshot", async () => {
    const { handle, ids, time, runtime, ofType, syncClock } = setup();
    handle(startAction(ids[0]));
    handle(pickAction(ids[0], "rounds"));
    time.advance(countdownMs);
    await settle();
    const runner = runtime.running?.runner;
    handle({
      t: "room:welcome",
      d: { role: "host", code: "BEAN", phase: "playing", locked: false },
    });
    handle({ t: "room:snapshot", d: snapshotOf([ids[0]], { [ids[0]]: "old" }) });
    await syncClock();
    expect(runtime.running?.runner).toBe(runner);
    expect(state(runtime).said).toEqual({});
    expect(ofType("room:phase").map((message) => message.d.phase)).toEqual(["menu", "playing"]);
  });

  it("recovers from the newest welcome when the socket drops before the clock synced", async () => {
    const { rejoin, syncClock, runtime, ids } = setup();
    rejoin("playing", snapshotOf(ids, { [ids[2]]: "first" }));
    runtime.disconnected();
    rejoin("playing", snapshotOf(ids, { [ids[2]]: "second" }));
    await syncClock();
    expect(state(runtime).said).toEqual({ [ids[2]]: "second" });
  });
});
