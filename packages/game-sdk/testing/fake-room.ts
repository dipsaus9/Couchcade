import { clampInputAtMs, tickMs, tickTimeMs } from "../src/contract/index.ts";
import type {
  CouchcadeGame,
  GameInput,
  InputContext,
  Outcome,
  Player,
} from "../src/contract/index.ts";
import type { ControllerView, JsonValue } from "@couchcade/protocol";
import { createPlayers } from "./players.ts";

/** One accepted input in a recording. */
export interface RecordedInput {
  /** The tick that applied the input. */
  tick: number;
  playerId: string;
  input: GameInput;
  /** Game time when the player acted, before clamping. */
  atMs: number;
}

/**
 * A recorded match, stored as JSON in a game's `test/`. `ticks` is optional: how many ticks the
 * recording covers. Without it a replay stops at the last event.
 */
export interface Recording {
  gameId: string;
  seed: number;
  players: Player[];
  events: RecordedInput[];
  ticks?: number;
}

export interface FakeRoomOptions {
  /** A player count (see `createPlayers`) or the players themselves. */
  players: number | readonly Player[];
  seed: number;
  /** Passed to every `InputContext`. Defaults to 0, as on an uncalibrated TV. */
  displayLagMs?: number;
}

export interface FakeRoom<TInput extends GameInput, TState, TView extends JsonValue> {
  readonly game: CouchcadeGame<TInput, TState, TView>;
  readonly players: readonly Player[];
  readonly seed: number;
  /** The latest state. */
  readonly state: TState;
  /** Ticks run since `init`. */
  readonly tick: number;
  /** Game time of the latest tick. */
  readonly nowMs: number;
  /** True once `outcome` returned placements. The room then ignores inputs and ticks. */
  readonly over: boolean;
  /**
   * Queues an input for the next tick, like the host does when it arrives. `atMs` is game time
   * when the player acted and defaults to `nowMs`. Returns false when `inputSchema` drops it.
   */
  input(playerId: string, input: unknown, atMs?: number): boolean;
  /** Runs `count` fixed ticks: queued inputs in arrival order, then `onTick` if `realtime`. */
  step(count?: number): TState;
  /** Runs ticks until `ms` of game time passed or the game is over. */
  advance(ms: number): TState;
  /** Runs ticks until the game is over, at most `maxTicks`. Returns the outcome, or null. */
  runToEnd(maxTicks?: number): Outcome | null;
  /** Calls `onPlayerLeft`, if the game has it. Recordings don't contain leaves. */
  leave(playerId: string): TState;
  view(playerId: string): ControllerView & { data: TView };
  outcome(): Outcome | null;
  /** Everything so far as a recording that `replay` plays back to the same state. */
  recording(): Recording;
}

/** Ten minutes of game time. */
const defaultMaxTicks = 10 * 60 * 60;

/**
 * Runs a game headless with a manual tick clock, the way the host runtime runs it (platform.md,
 * "How the host runs a game"): inputs are validated with `inputSchema`, applied at the next
 * tick in arrival order with `atMs` clamped to at most 500 ms in the past, then `onTick` runs
 * for real-time games and `outcome` is checked.
 */
export function createFakeRoom<TInput extends GameInput, TState, TView extends JsonValue>(
  game: CouchcadeGame<TInput, TState, TView>,
  { players: playersOption, seed, displayLagMs = 0 }: FakeRoomOptions,
): FakeRoom<TInput, TState, TView> {
  const players: readonly Player[] =
    typeof playersOption === "number" ? createPlayers(playersOption) : [...playersOption];
  const byId = new Map(players.map((player) => [player.id, player]));
  const playerById = (id: string): Player => {
    const player = byId.get(id);
    if (player === undefined) throw new RangeError(`No player ${id} in this fake room`);
    return player;
  };

  let state = game.init(players, seed);
  let tick = 0;
  let over = game.outcome(state) !== null;
  let queue: RecordedInput[] = [];
  const events: RecordedInput[] = [];

  const runTick = (): void => {
    tick += 1;
    const nowMs = tickTimeMs(tick);
    const inputs = queue;
    queue = [];
    for (const event of inputs) {
      const ctx: InputContext = { atMs: clampInputAtMs(event.atMs, nowMs), nowMs, displayLagMs };
      state = game.onPlayerInput(state, playerById(event.playerId), event.input as TInput, ctx);
      events.push({ ...event, tick });
    }
    if (game.realtime && game.onTick) state = game.onTick(state, tickMs);
    over = game.outcome(state) !== null;
  };

  const room: FakeRoom<TInput, TState, TView> = {
    game,
    players,
    seed,
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },
    get nowMs() {
      return tickTimeMs(tick);
    },
    get over() {
      return over;
    },
    input(playerId, input, atMs = tickTimeMs(tick)) {
      playerById(playerId);
      if (over) return false;
      const parsed = game.inputSchema.safeParse(input);
      if (!parsed.success) return false;
      queue.push({ tick: tick + 1, playerId, input: parsed.data, atMs });
      return true;
    },
    step(count = 1) {
      for (let i = 0; i < count; i++) {
        if (over) break;
        runTick();
      }
      return state;
    },
    advance(ms) {
      return room.step(Math.ceil(ms / tickMs - 1e-9));
    },
    runToEnd(maxTicks = defaultMaxTicks) {
      room.step(maxTicks);
      return game.outcome(state);
    },
    leave(playerId) {
      const player = playerById(playerId);
      if (game.onPlayerLeft && !over) {
        state = game.onPlayerLeft(state, player);
        over = game.outcome(state) !== null;
      }
      return state;
    },
    view: (playerId) => game.view(state, playerById(playerId)),
    outcome: () => game.outcome(state),
    recording: () => ({
      gameId: game.id,
      seed,
      players: structuredClone([...players]),
      events: structuredClone(events),
      ticks: tick,
    }),
  };
  return room;
}
