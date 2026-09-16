import { describe, expect, it } from "vitest";
import { playerInfoSchema } from "@couchcade/protocol";
import { tickMs } from "@couchcade/game-sdk/contract";
import { createFakeRoom, createPlayers, replay } from "@couchcade/game-sdk/testing";
import type { Recording } from "@couchcade/game-sdk/testing";
import drawRace, { falseStartMs, tapWindowMs } from "../testing/fixtures/draw-race/src/index.ts";
import pickANumber from "../testing/fixtures/pick-a-number/src/index.ts";

const tap = { type: "tap" } as const;

/** A draw-race room for two players, ticked to just after GO. */
function afterGo(seed = 3) {
  const room = createFakeRoom(drawRace, { players: 2, seed });
  const { goAtMs } = room.state;
  room.advance(goAtMs + 300);
  return { room, goAtMs, noor: room.players[0]!.id, sam: room.players[1]!.id };
}

describe("createPlayers", () => {
  it("makes valid, seated players in join order", () => {
    const players = createPlayers(8);
    expect(players.map((player) => playerInfoSchema.parse(player))).toEqual(players);
    expect(players.map((player) => player.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(players.map((player) => player.id)).size).toBe(8);
  });

  it("refuses counts outside 1 to 8", () => {
    expect(() => createPlayers(0)).toThrow(RangeError);
    expect(() => createPlayers(9)).toThrow(RangeError);
  });
});

describe("createFakeRoom", () => {
  it("starts at tick 0 with the state from init", () => {
    const room = createFakeRoom(drawRace, { players: 3, seed: 11 });
    expect(room.tick).toBe(0);
    expect(room.nowMs).toBe(0);
    expect(room.state).toStrictEqual(drawRace.init(room.players, 11));
  });

  it("runs fixed 60 Hz ticks on a manual clock", () => {
    const room = createFakeRoom(drawRace, { players: 2, seed: 1 });
    room.step(60);
    expect(room.tick).toBe(60);
    expect(room.nowMs).toBe(1000);
    expect(room.state.nowMs).toBeCloseTo(1000, 6);
    room.advance(500);
    expect(room.tick).toBe(90);
  });

  it("judges a tap on when the player acted, not on when it arrived", () => {
    const { room, goAtMs, noor } = afterGo();
    // The tap happened 250 ms after GO but only arrives now, 300 ms after GO.
    room.input(noor, tap, goAtMs + 250);
    room.step();
    expect(room.view(noor).data).toEqual({ result: "valid", ms: 250 });
  });

  it("treats a tap less than 100 ms after GO as a foul", () => {
    const { room, goAtMs, noor, sam } = afterGo();
    room.input(noor, tap, goAtMs + falseStartMs - 1);
    room.input(sam, tap, goAtMs + falseStartMs);
    room.step();
    expect(room.view(noor)).toMatchObject({ data: { result: "foul" }, cue: "foul" });
    expect(room.view(sam).data).toEqual({ result: "valid", ms: falseStartMs });
  });

  it("marks a foul right after the fake cue as fooled", () => {
    const room = createFakeRoom(drawRace, { players: 2, seed: 3 });
    const { fakeAtMs } = room.state;
    room.advance(fakeAtMs + 400);
    room.input(room.players[0]!.id, tap, fakeAtMs + 300);
    room.step();
    expect(room.view(room.players[0]!.id).data.result).toBe("fooled");
  });

  it("clamps a late tap to at most 500 ms before the tick that applies it", () => {
    const { room, goAtMs, noor } = afterGo();
    room.advance(1000);
    room.input(noor, tap, goAtMs + 200);
    room.step();
    const applied = room.nowMs;
    expect(room.view(noor).data).toEqual({
      result: "valid",
      ms: Math.round(applied - 500 - goAtMs),
    });
  });

  it("drops inputs that fail inputSchema and refuses unknown players", () => {
    const room = createFakeRoom(drawRace, { players: 2, seed: 1 });
    expect(room.input(room.players[0]!.id, { type: "shoot" })).toBe(false);
    expect(room.input(room.players[0]!.id, tap)).toBe(true);
    expect(() => room.input("ZZZZZZZZ", tap)).toThrow("No player ZZZZZZZZ");
  });

  it("applies queued inputs in arrival order on the next tick", () => {
    const { room, goAtMs, noor } = afterGo();
    room.input(noor, tap, goAtMs + 150);
    room.input(noor, tap, goAtMs + 120);
    expect(room.view(noor).data.result).toBeNull();
    room.step();
    // One tap per player: the first to arrive counts.
    expect(room.view(noor).data).toEqual({ result: "valid", ms: 150 });
  });

  it("runs to the outcome and then stops", () => {
    const { room, goAtMs, noor, sam } = afterGo();
    room.input(noor, tap, goAtMs + 180);
    room.input(sam, tap, goAtMs + 240);
    const outcome = room.runToEnd();
    expect(outcome?.placements).toEqual([
      { playerId: noor, place: 1 },
      { playerId: sam, place: 2 },
    ]);
    expect(room.over).toBe(true);
    const tick = room.tick;
    room.step(10);
    expect(room.tick).toBe(tick);
    expect(room.input(noor, tap)).toBe(false);
  });

  it("ends a round nobody taps when the tap window closes", () => {
    const room = createFakeRoom(drawRace, { players: 2, seed: 5 });
    room.runToEnd();
    expect(room.nowMs).toBeGreaterThanOrEqual(room.state.goAtMs + tapWindowMs);
    expect(room.nowMs).toBeLessThan(room.state.goAtMs + tapWindowMs + tickMs);
  });

  it("calls onPlayerLeft for a game that has it", () => {
    const room = createFakeRoom(pickANumber, { players: 2, seed: 4 });
    const [first, second] = room.players;
    room.input(first!.id, { type: "guess", payload: { value: 5 } });
    room.step();
    expect(room.outcome()).toBeNull();
    room.leave(second!.id);
    expect(room.state.left).toEqual([second!.id]);
    expect(room.over).toBe(true);
  });

  it("doesn't run onTick for a game that isn't real-time", () => {
    const game = {
      ...pickANumber,
      onTick: () => {
        throw new Error("onTick ran");
      },
    };
    expect(() => createFakeRoom(game, { players: 1, seed: 1 }).step(5)).not.toThrow();
  });
});

describe("replay", () => {
  it("plays a recording back to the same final state", () => {
    const { room, goAtMs, noor, sam } = afterGo(8);
    room.input(noor, tap, goAtMs - 40);
    room.step(3);
    room.input(sam, tap, goAtMs + 290);
    room.runToEnd();
    const recording: Recording = JSON.parse(JSON.stringify(room.recording()));
    expect(recording.events.map((event) => event.playerId)).toEqual([noor, sam]);
    expect(replay(drawRace, recording)).toStrictEqual(room.state);
  });

  it("replays to recording.ticks when there are ticks after the last input", () => {
    const room = createFakeRoom(drawRace, { players: 2, seed: 2 });
    room.step(30);
    const recording = room.recording();
    expect(recording).toMatchObject({ gameId: "draw-race", seed: 2, events: [], ticks: 30 });
    expect(replay(drawRace, recording)).toStrictEqual(room.state);
  });

  it("refuses a recording of another game or with events out of order", () => {
    const recording: Recording = {
      gameId: "draw-race",
      seed: 1,
      players: createPlayers(2),
      events: [],
    };
    expect(() => replay(pickANumber, recording)).toThrow("not pick-a-number");
    const event = { playerId: recording.players[0]!.id, input: tap, atMs: 0 };
    const unordered = {
      ...recording,
      events: [
        { ...event, tick: 5 },
        { ...event, tick: 4 },
      ],
    };
    expect(() => replay(drawRace, unordered)).toThrow("tick order");
  });
});
