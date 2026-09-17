import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { defineGame } from "@couchcade/game-sdk/contract";
import type { CouchcadeGame, GameInput } from "@couchcade/game-sdk/contract";
import { gameContractChecks, sampleInputs } from "@couchcade/game-sdk/testing";
import type { GameContractOptions } from "@couchcade/game-sdk/testing";
import drawRace from "../testing/fixtures/draw-race/src/index.ts";
import pickANumber from "../testing/fixtures/pick-a-number/src/index.ts";

type Counter = { count: number; log: number[] };

/** A tiny valid real-time game that the tests below break one rule at a time. */
const counter = defineGame({
  id: "counter",
  title: "Counter",
  players: { min: 1, max: 4 },
  realtime: true,
  needsMotion: false,
  scene: "desert",
  inputSchema: z.object({
    type: z.literal("add"),
    payload: z.object({ n: z.int().check(z.gte(1), z.lte(3)) }),
  }),
  init: (players, seed): Counter => ({ count: seed % 10, log: players.map(() => 0) }),
  onPlayerInput: (state, _player, input) => ({ ...state, count: state.count + input.payload.n }),
  onTick: (state) => ({ ...state, log: [...state.log.slice(1), state.count] }),
  view: (state) => ({ screen: "counter", data: { count: state.count } }),
  outcome: (state) => (state.count > 1000 ? { placements: [] } : null),
  hostScene: () => Promise.reject(new Error("none")),
});

const options = { folder: "counter", ticks: 120 };

/** Runs the check with this name and returns its error, or undefined when it passes. */
function failure<TInput extends GameInput, TState>(
  game: CouchcadeGame<TInput, TState, never> | CouchcadeGame,
  name: string,
  checkOptions: GameContractOptions<TInput> = options as GameContractOptions<TInput>,
  testPath?: string,
): Error | undefined {
  const check = gameContractChecks(game as CouchcadeGame<TInput, TState>, checkOptions).find(
    (candidate) => candidate.name.startsWith(name),
  );
  if (check === undefined) throw new Error(`No check named ${name}`);
  try {
    check.run(testPath);
    return undefined;
  } catch (error) {
    return error as Error;
  }
}

function allFailures(game: CouchcadeGame, checkOptions = options): string[] {
  return gameContractChecks(game, checkOptions).flatMap((check) => {
    try {
      check.run();
      return [];
    } catch {
      return [check.name];
    }
  });
}

describe("gameContractChecks", () => {
  it("pass for a valid game", () => {
    expect(allFailures(counter as CouchcadeGame)).toEqual([]);
  });

  describe("id", () => {
    it("fails when the id doesn't match the folder", () => {
      expect(failure(counter, "has a kebab-case id", { folder: "other" })?.message).toContain(
        "other",
      );
    });

    it("fails when the id isn't kebab-case", () => {
      const game = { ...counter, id: "Counter" };
      expect(failure(game, "has a kebab-case id", { folder: "Counter" })).toBeDefined();
    });

    it("takes the folder from a games/<id>/ test path", () => {
      const inGames = "/repo/games/counter/test/contract.test.ts";
      const elsewhere = "/repo/games/quick-draw/test/contract.test.ts";
      expect(failure(counter, "has a kebab-case id", {}, inGames)).toBeUndefined();
      expect(failure(counter, "has a kebab-case id", {}, elsewhere)).toBeDefined();
      expect(
        failure(counter, "has a kebab-case id", {}, "/repo/test/x.test.ts")?.message,
      ).toContain("Pass { folder }");
    });
  });

  it.each([
    { min: 0, max: 2 },
    { min: 3, max: 2 },
    { min: 1, max: 9 },
  ])("fails for player bounds %o", (players) => {
    expect(failure({ ...counter, players }, "allows between 1 and 8 players")).toBeDefined();
  });

  it("fails when init isn't deterministic for a seed", () => {
    let calls = 0;
    const game = { ...counter, init: (): Counter => ({ count: calls++, log: [] }) };
    expect(failure(game, "init gives the same")?.message).toContain("init with seed");
  });

  it("fails when init returns state that isn't plain JSON data", () => {
    const game = { ...counter, init: () => ({ count: 0, log: [], seen: new Set<string>() }) };
    expect(failure(game, "init gives the same")?.message).toContain("plain JSON data");
  });

  it("fails when onPlayerInput mutates the state", () => {
    const game = {
      ...counter,
      onPlayerInput: (state: Counter) => {
        state.count += 1;
        return state;
      },
    };
    expect(failure(game, "onPlayerInput and onTick are pure")?.message).toContain(
      "onPlayerInput changed its arguments",
    );
  });

  it("fails when onPlayerInput isn't repeatable", () => {
    let calls = 0;
    const game = {
      ...counter,
      onPlayerInput: (state: Counter) => ({ ...state, count: state.count + calls++ }),
    };
    expect(failure(game, "onPlayerInput and onTick are pure")?.message).toContain(
      "onPlayerInput gave a different result",
    );
  });

  it("fails when onTick mutates the state", () => {
    const game = {
      ...counter,
      onTick: (state: Counter) => {
        state.log.push(state.count);
        return { ...state };
      },
    };
    expect(failure(game, "onPlayerInput and onTick are pure")?.message).toContain(
      "onTick changed its arguments",
    );
  });

  it("fails when replaying the same inputs gives another state", () => {
    let session = 0;
    const game = {
      ...counter,
      init: (): Counter => ({ count: 0, log: [] }),
      onTick: (state: Counter) => ({ ...state, log: [session++] }),
    };
    expect(failure(game, "the same seed and inputs replay")).toBeDefined();
  });

  it("fails when a view isn't a ControllerView", () => {
    const game = { ...counter, view: () => ({ screen: "", data: null }) };
    expect(failure(game as CouchcadeGame, "view returns a valid")?.message).toContain("view for");
  });

  it("fails when outcome places a player who isn't in the room", () => {
    const game = {
      ...counter,
      outcome: () => ({ placements: [{ playerId: "ZZZZZZZZ", place: 1 }] }),
    };
    expect(failure(game, "outcome is null or placements")?.message).toContain("not in the room");
  });

  it("fails when onPlayerLeft mutates the state", () => {
    const game = {
      ...counter,
      onPlayerLeft: (state: Counter) => {
        state.count = -1;
        return state;
      },
    };
    expect(failure(game, "onPlayerLeft is pure")?.message).toContain("changed its arguments");
  });

  it("fails when a snapshot is over 600 bytes, and passes at 600", () => {
    const sized = (bytes: number) => ({
      ...counter,
      // `{"p":"…"}` is 8 bytes around the padding.
      snapshot: () => ({ p: "x".repeat(bytes - 8) }),
      restore: (): Counter => ({ count: 0, log: [] }),
    });
    expect(failure(sized(601), "snapshot fits 600 bytes")?.message).toContain("601 bytes");
    expect(failure(sized(600), "snapshot fits 600 bytes")).toBeUndefined();
  });

  it("fails when no input can be derived and none is given", () => {
    const game = {
      ...counter,
      inputSchema: z.object({ type: z.string().check(z.regex(/^x{3}$/)) }),
      onPlayerInput: (state: Counter) => state,
    };
    expect(failure(game as CouchcadeGame, "onPlayerInput and onTick are pure")?.message).toContain(
      "Pass { inputs }",
    );
    const withInputs = { ...options, inputs: [{ type: "xxx" }] };
    expect(
      failure(game as CouchcadeGame, "onPlayerInput and onTick are pure", withInputs),
    ).toBeUndefined();
  });
});

describe("sampleInputs", () => {
  it("derives literals, union branches and number bounds from inputSchema", () => {
    expect(sampleInputs(drawRace.inputSchema)).toEqual([{ type: "tap" }]);
    expect(sampleInputs(pickANumber.inputSchema).map((input) => input.payload.value)).toEqual([
      1, 9, 5,
    ]);
    const union = z.union([
      z.object({ type: z.literal("move"), payload: z.enum(["left", "right"]) }),
      z.object({ type: z.literal("fire"), payload: z.optional(z.boolean()) }),
    ]);
    expect(sampleInputs(union)).toEqual([
      { type: "move", payload: "left" },
      { type: "move", payload: "right" },
      { type: "fire", payload: true },
      { type: "fire" },
      { type: "fire", payload: false },
    ]);
  });

  it("only returns inputs the schema accepts", () => {
    const schema = z.object({ type: z.string().check(z.regex(/^x{3}$/)) });
    expect(sampleInputs(schema)).toEqual([]);
  });
});
