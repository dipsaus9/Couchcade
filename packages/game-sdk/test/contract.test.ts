import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod/mini";
import type { ControllerView, JsonValue, PlayerInfo } from "@couchcade/protocol";
import {
  checkControllerDefinition,
  checkGameDefinition,
  clampInputAtMs,
  defineController,
  defineGame,
  maxInputAgeMs,
  tickMs,
  tickTimeMs,
} from "@couchcade/game-sdk/contract";
import type {
  CouchcadeController,
  CouchcadeGame,
  GameInput,
  InputContext,
  Outcome,
  Player,
} from "@couchcade/game-sdk/contract";
import drawRace from "../testing/fixtures/draw-race/src/index.ts";
import pickANumber from "../testing/fixtures/pick-a-number/src/index.ts";
import drawRaceController from "../testing/fixtures/draw-race/src/controller/index.ts";

const inputSchema = z.object({ type: z.literal("go"), payload: z.object({ n: z.int() }) });

const minimalGame = {
  id: "minimal",
  title: "Minimal",
  players: { min: 1, max: 8 },
  realtime: false,
  needsMotion: false,
  scene: "desert",
  inputSchema,
  init: () => ({ count: 0 }),
  onPlayerInput: (state: { count: number }) => ({ count: state.count + 1 }),
  view: () => ({ screen: "minimal", data: null }),
  outcome: () => null,
  hostScene: () => Promise.reject(new Error("none")),
};

describe("defineGame", () => {
  it("returns the definition unchanged", () => {
    expect(defineGame(minimalGame)).toBe(minimalGame);
  });

  it("infers input, state and view types from the definition", () => {
    const game = defineGame({
      ...minimalGame,
      view: (state) => ({ screen: "minimal", data: { count: state.count } }),
    });
    expectTypeOf(game).toEqualTypeOf<
      CouchcadeGame<{ type: "go"; payload: { n: number } }, { count: number }, { count: number }>
    >();
    expectTypeOf(game).toExtend<CouchcadeGame>();
  });

  it("has exactly the members of the contract in docs/architecture/platform.md", () => {
    expectTypeOf<keyof CouchcadeGame>().toEqualTypeOf<
      | "id"
      | "title"
      | "players"
      | "realtime"
      | "needsMotion"
      | "scene"
      | "hidden"
      | "inputSchema"
      | "init"
      | "onPlayerInput"
      | "onTick"
      | "onPlayerLeft"
      | "view"
      | "outcome"
      | "snapshot"
      | "restore"
      | "hostScene"
    >();
    expectTypeOf<Player>().toEqualTypeOf<PlayerInfo>();
    expectTypeOf<GameInput>().toEqualTypeOf<{ type: string; payload?: JsonValue }>();
    expectTypeOf<InputContext>().toEqualTypeOf<{
      atMs: number;
      nowMs: number;
      displayLagMs: number;
    }>();
    expectTypeOf<Outcome["placements"][number]>().toEqualTypeOf<{
      playerId: string;
      place: number;
      score?: number;
    }>();
    expectTypeOf<ReturnType<CouchcadeGame["view"]>>().toExtend<ControllerView>();
    // vue and phaser types resolve (type-only devDependencies), so the loaders are typed.
    expectTypeOf<Awaited<ReturnType<CouchcadeGame["hostScene"]>>>().not.toBeAny();
    expectTypeOf<Awaited<ReturnType<CouchcadeController["component"]>>>().not.toBeAny();
  });
});

describe("defineController", () => {
  it("returns the phone entry unchanged", () => {
    const entry = { id: "minimal", component: () => Promise.reject(new Error("none")) };
    expect(defineController(entry)).toBe(entry);
    expectTypeOf(defineController(entry)).toEqualTypeOf<CouchcadeController>();
    expectTypeOf<keyof CouchcadeController>().toEqualTypeOf<"id" | "component">();
  });
});

describe("checkGameDefinition", () => {
  it("accepts the fixture games", () => {
    expect(checkGameDefinition(minimalGame)).toEqual([]);
    expect(checkGameDefinition(drawRace)).toEqual([]);
    expect(checkGameDefinition(pickANumber)).toEqual([]);
  });

  it.each([
    [{ id: "Quick_Draw" }, "is not kebab-case"],
    [{ title: "" }, "title is empty"],
    [{ title: "Seventeen letters" }, "longer than 16 characters"],
    [{ players: { min: 0, max: 4 } }, "1 <= min <= max <= 8"],
    [{ players: { min: 5, max: 4 } }, "1 <= min <= max <= 8"],
    [{ players: { min: 2, max: 9 } }, "1 <= min <= max <= 8"],
    [{ players: { min: 1.5, max: 4 } }, "1 <= min <= max <= 8"],
    [{ realtime: "yes" }, "realtime is not a boolean"],
    [{ hidden: "yes" }, "hidden is not a boolean"],
    [{ scene: "" }, "scene is empty"],
    [{ inputSchema: {} }, "inputSchema is not a zod schema"],
    [{ outcome: undefined }, "outcome is not a function"],
    [{ hostScene: undefined }, "hostScene is not a function"],
    [{ onTick: 1 }, "onTick is not a function"],
    [{ snapshot: () => null }, "snapshot and restore come as a pair"],
  ])("rejects %o", (change, problem) => {
    expect(checkGameDefinition({ ...minimalGame, ...change }).join("\n")).toContain(problem);
  });

  it("allows a 16-character title", () => {
    expect(checkGameDefinition({ ...minimalGame, title: "Sixteen letters!" })).toEqual([]);
  });

  it("rejects anything that isn't an object", () => {
    expect(checkGameDefinition(null)).toEqual(["is not an object"]);
  });
});

describe("checkControllerDefinition", () => {
  it("accepts a fixture phone entry", () => {
    expect(checkControllerDefinition(drawRaceController)).toEqual([]);
  });

  it("rejects a bad id or a missing component", () => {
    expect(checkControllerDefinition({ id: "Bad id", component: () => null })).toEqual([
      'id "Bad id" is not kebab-case',
    ]);
    expect(checkControllerDefinition({ id: "draw-race" })).toEqual(["component is not a function"]);
    expect(checkControllerDefinition(undefined)).toEqual(["is not an object"]);
  });
});

describe("fixed step and input time", () => {
  it("steps at 60 Hz", () => {
    expect(tickMs).toBe(1000 / 60);
    expect(tickTimeMs(0)).toBe(0);
    expect(tickTimeMs(60)).toBe(1000);
  });

  it("clamps when a player acted to at most 500 ms in the past and never in the future", () => {
    expect(maxInputAgeMs).toBe(500);
    expect(clampInputAtMs(900, 1000)).toBe(900);
    expect(clampInputAtMs(100, 1000)).toBe(500);
    expect(clampInputAtMs(1200, 1000)).toBe(1000);
  });
});
