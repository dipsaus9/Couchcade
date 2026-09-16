import { describe, expect, it } from "vitest";
import { controllerViewSchema, encode } from "@couchcade/protocol";
import type { JsonValue } from "@couchcade/protocol";
import { checkGameDefinition, isGameId, maxPlayers } from "../src/contract/index.ts";
import type { CouchcadeGame, GameInput, Outcome, Player } from "../src/contract/index.ts";
import { createFakeRoom } from "./fake-room.ts";
import { createPlayers } from "./players.ts";
import { replay } from "./replay.ts";
import { sampleInputs } from "./sample-inputs.ts";

export interface GameContractOptions<TInput extends GameInput = GameInput> {
  /**
   * The folder the game lives in. Defaults to the folder after `games/` in the test file's path,
   * so `games/quick-draw/test/contract.test.ts` expects the id `quick-draw`.
   */
  folder?: string;
  /** Inputs to play on top of the samples derived from `inputSchema`. */
  inputs?: readonly TInput[];
  /** Seeds to run every check with. Defaults to `[1, 7, 2026]`. */
  seeds?: readonly number[];
  /** Ticks per simulated session. Defaults to 1,800 (30 seconds of game time). */
  ticks?: number;
  /** A player acts every this many ticks, taking turns. Defaults to 7. */
  inputEvery?: number;
}

export interface GameContractCheck {
  name: string;
  /** Throws an assertion error when the game breaks the contract. */
  run(testPath?: string): void;
}

/** Round number in the `room:snapshot` frame that the snapshot size check encodes. */
const snapshotRound = 9;

/**
 * The checks `testGameContract` runs, one per test. Exposed so a check can be run on its own,
 * for example to prove it fails for a broken game.
 */
export function gameContractChecks<TInput extends GameInput, TState, TView extends JsonValue>(
  game: CouchcadeGame<TInput, TState, TView>,
  options: GameContractOptions<TInput> = {},
): GameContractCheck[] {
  const { seeds = [1, 7, 2026], ticks = 1800, inputEvery = 7 } = options;

  const playerCounts = (): number[] => {
    const { min, max } = game.players;
    expectValidBounds(min, max);
    return [...new Set([min, max])];
  };
  const inputs = (): TInput[] => {
    const all = [...sampleInputs(game.inputSchema), ...(options.inputs ?? [])];
    expect(
      all.length,
      "No sample inputs could be derived from inputSchema. Pass { inputs } to testGameContract.",
    ).toBeGreaterThan(0);
    return all;
  };
  const sessions = (run: (players: Player[], seed: number) => void): void => {
    for (const count of playerCounts()) {
      for (const seed of seeds) run(createPlayers(count), seed);
    }
  };

  return [
    {
      name: "has every member of the contract",
      run() {
        expect(checkGameDefinition(game)).toEqual([]);
      },
    },
    {
      name: "has a kebab-case id equal to its folder, so no other game has it",
      run(testPath) {
        const folder = options.folder ?? folderFromTestPath(testPath);
        expect(
          folder,
          "Can't tell the game's folder from the test path. Pass { folder } to testGameContract.",
        ).toBeDefined();
        expect(isGameId(game.id), `id ${JSON.stringify(game.id)} is kebab-case`).toBe(true);
        expect(game.id).toBe(folder);
      },
    },
    {
      name: `allows between 1 and ${maxPlayers} players`,
      run() {
        expectValidBounds(game.players.min, game.players.max);
      },
    },
    {
      name: "init gives the same JSON-safe state for the same seed",
      run() {
        sessions((players, seed) => {
          const before = structuredClone(players);
          const state = game.init(players, seed);
          expect(players, "init changed its players argument").toStrictEqual(before);
          expectJsonSafe(state, "init");
          expect(game.init(structuredClone(before), seed), `init with seed ${seed}`).toStrictEqual(
            state,
          );
        });
      },
    },
    {
      name: "onPlayerInput and onTick are pure and repeatable",
      run() {
        const samples = inputs();
        sessions((players, seed) => {
          play(checkedGame(game), players, seed, samples, ticks, inputEvery);
        });
      },
    },
    {
      name: "the same seed and inputs replay to the same state",
      run() {
        const samples = inputs();
        sessions((players, seed) => {
          const room = play(game, players, seed, samples, ticks, inputEvery);
          const recording = JSON.parse(JSON.stringify(room.recording()));
          expect(replay(game, recording), `replay with seed ${seed}`).toStrictEqual(room.state);
        });
      },
    },
    {
      name: "view returns a valid ControllerView for every player",
      run() {
        const samples = inputs();
        sessions((players, seed) => {
          const viewAll = (state: TState): void => {
            for (const player of players) {
              const view = game.view(state, player);
              const parsed = controllerViewSchema.safeParse(view);
              expect(parsed.success, `view for ${player.name}: ${JSON.stringify(view)}`).toBe(true);
            }
          };
          play(game, players, seed, samples, ticks, inputEvery, viewAll);
        });
      },
    },
    {
      name: "outcome is null or placements of the room's players",
      run() {
        const samples = inputs();
        sessions((players, seed) => {
          const check = (state: TState): void => expectValidOutcome(game.outcome(state), players);
          play(game, players, seed, samples, ticks, inputEvery, check);
        });
      },
    },
    {
      name: "onPlayerLeft is pure (when the game has it)",
      run() {
        if (!game.onPlayerLeft) return;
        const samples = inputs();
        sessions((players, seed) => {
          const room = play(game, players, seed, samples, Math.floor(ticks / 2), inputEvery);
          const leaving = players.at(-1) as Player;
          expectPure("onPlayerLeft", game.onPlayerLeft!.bind(game), [room.state, leaving]);
        });
      },
    },
    {
      name: "snapshot fits a 1 KB frame and restore is deterministic (when the game has them)",
      run() {
        if (!game.snapshot || !game.restore) return;
        const samples = inputs();
        sessions((players, seed) => {
          const room = play(game, players, seed, samples, ticks, inputEvery);
          const snapshot = expectPure("snapshot", game.snapshot!.bind(game), [room.state]);
          expect(() =>
            encode({
              t: "room:snapshot",
              d: { round: snapshotRound, gameId: game.id, data: snapshot as JsonValue },
            }),
          ).not.toThrow();
          const restored = expectPure("restore", game.restore!.bind(game), [
            players,
            seed,
            snapshot,
          ]);
          expectJsonSafe(restored, "restore");
        });
      },
    },
  ];
}

/**
 * Registers a Vitest suite that checks a game against the contract in
 * docs/architecture/platform.md: a kebab-case id equal to its folder, `1 <= min <= max <= 8`,
 * seed-deterministic JSON-safe `init`, pure and repeatable `onPlayerInput` and `onTick` over a
 * simulated session, deterministic replay, valid views and outcomes, and the optional hooks.
 *
 * ```ts
 * // games/quick-draw/test/contract.test.ts
 * import { testGameContract } from "@couchcade/game-sdk/testing";
 * import game from "../src/index.ts";
 * testGameContract(game);
 * ```
 */
export function testGameContract<TInput extends GameInput, TState, TView extends JsonValue>(
  game: CouchcadeGame<TInput, TState, TView>,
  options: GameContractOptions<TInput> = {},
): void {
  describe(`game contract: ${game.id}`, () => {
    const checks = gameContractChecks(game, options).map((check) => [check.name, check] as const);
    // Each check asserts with expect() inside run().
    // oxlint-disable-next-line vitest/expect-expect
    it.for(checks)("%s", ([, check], { task }) => {
      check.run(task.file.filepath);
    });
  });
}

/** The folder after the last `games/` segment of a test file path. */
function folderFromTestPath(testPath: string | undefined): string | undefined {
  const segments = (testPath ?? "").split(/[\\/]/);
  const index = segments.lastIndexOf("games");
  return index >= 0 && index < segments.length - 2 ? segments[index + 1] : undefined;
}

function expectValidBounds(min: number, max: number): void {
  expect(Number.isInteger(min) && Number.isInteger(max), "players.min and max are integers").toBe(
    true,
  );
  expect(min, "players.min").toBeGreaterThanOrEqual(1);
  expect(max, "players.max").toBeGreaterThanOrEqual(min);
  expect(max, "players.max").toBeLessThanOrEqual(maxPlayers);
}

/** State must be plain JSON data: the same after a JSON round trip, with no class instances. */
function expectJsonSafe(value: unknown, what: string): void {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    expect.fail(`${what} returned state that isn't JSON: ${String(error)}`);
  }
  expect(json, `${what} returned state that isn't JSON`).toBeTypeOf("string");
  expect(
    JSON.parse(json as string),
    `${what} returned state that isn't plain JSON data`,
  ).toStrictEqual(value);
}

/**
 * Calls `fn` and checks it is pure: its arguments are unchanged afterwards, a second call with
 * copies of the same arguments gives an equal result, and the result is JSON-safe.
 */
function expectPure<A extends unknown[], R>(name: string, fn: (...args: A) => R, args: A): R {
  expectJsonSafe(args, `The arguments to ${name}`);
  const before = structuredClone(args);
  const result = fn(...args);
  expect(args, `${name} changed its arguments`).toStrictEqual(before);
  expectJsonSafe(result, name);
  expect(
    fn(...structuredClone(before)),
    `${name} gave a different result for the same arguments`,
  ).toStrictEqual(result);
  return result;
}

/** The game with `onPlayerInput` and `onTick` wrapped in purity checks. */
function checkedGame<TInput extends GameInput, TState, TView extends JsonValue>(
  game: CouchcadeGame<TInput, TState, TView>,
): CouchcadeGame<TInput, TState, TView> {
  const { onTick } = game;
  return {
    ...game,
    onPlayerInput: (...args) => expectPure("onPlayerInput", game.onPlayerInput.bind(game), args),
    onTick: onTick && ((...args) => expectPure("onTick", onTick.bind(game), args)),
  };
}

function expectValidOutcome(outcome: Outcome | null, players: readonly Player[]): void {
  if (outcome === null) return;
  const ids = new Set(players.map((player) => player.id));
  const placed = outcome.placements.map((placement) => placement.playerId);
  expect(new Set(placed).size, "a player is placed twice").toBe(placed.length);
  for (const placement of outcome.placements) {
    expect(ids.has(placement.playerId), `${placement.playerId} is not in the room`).toBe(true);
    expect(Number.isInteger(placement.place) && placement.place >= 1, "place is 1 or more").toBe(
      true,
    );
    if (placement.score !== undefined) expect(Number.isFinite(placement.score)).toBe(true);
  }
}

/**
 * Plays a session in a fake room: every `inputEvery` ticks the next player sends the next sample
 * input, stamped 0 to 300 ms in the past. `onState` sees the state after `init` and every tick.
 */
function play<TInput extends GameInput, TState, TView extends JsonValue>(
  game: CouchcadeGame<TInput, TState, TView>,
  players: readonly Player[],
  seed: number,
  inputs: readonly TInput[],
  ticks: number,
  inputEvery: number,
  onState?: (state: TState) => void,
) {
  const room = createFakeRoom(game, { players, seed });
  onState?.(room.state);
  for (let turn = 0; room.tick < ticks && !room.over; turn++) {
    const player = players[turn % players.length] as Player;
    const input = inputs[turn % inputs.length] as TInput;
    room.input(player.id, structuredClone(input), Math.max(0, room.nowMs - (turn % 4) * 100));
    for (let i = 0; i < inputEvery && room.tick < ticks && !room.over; i++) {
      room.step();
      onState?.(room.state);
    }
  }
  return room;
}
