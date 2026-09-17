/**
 * Lag compensation with rewind (docs/architecture/session-flow.md, "Lag compensation with rewind").
 *
 * A late input is applied at the tick the player acted in, not the tick it arrived in. `withRewind`
 * wraps a real-time game's `init`, `onPlayerInput` and `onTick` and returns pure functions with the
 * same signatures. The wrapped state carries its own short history, so the game contract, the host
 * runtime, replays and the contract test don't change:
 *
 * ```ts
 * const rules = withRewind({ init, onPlayerInput, onTick, onPlayerLeft });
 * export default defineGame({
 *   ...rules,
 *   view: (state, player) => view(rules.unwrap(state), player),
 *   outcome: (state) => outcome(rules.unwrap(state)),
 *   snapshot: (state) => snapshot(rules.unwrap(state)), // never the history
 *   restore: (players, seed, saved) => rules.wrap(restore(players, seed, saved)),
 * });
 * ```
 *
 * How it works:
 * 1. `onPlayerInput` never simulates. It numbers the input in arrival order and files it under the
 *    tick the player acted in. An input for the next tick waits in `pending`; a late one goes into
 *    the history entry of its tick and marks the history dirty from there.
 * 2. `onTick` re-simulates once from the earliest dirty tick (its stored `before` state, then each
 *    tick's inputs in arrival order and the game's own `onTick`), then runs the new tick with
 *    `pending` and adds it to the history. Several late inputs in one frame cost one re-simulation.
 * 3. The history keeps 200 ms (12 ticks). A rewind reaches back at most 150 ms (9 ticks). An older
 *    input is applied at the oldest tick it can reach and is never dropped. An input stamped after
 *    the next tick is applied at the next tick.
 * 4. The same inputs in the same arrival order give the same state, so replays reproduce rewinds.
 *
 * Which tick an input belongs to: the first tick whose time is at or after the moment the player
 * acted, `ceil(atMs / tickMs)`. That is the tick the host runner applies an input in when it arrives
 * without delay (`atMs` is clamped to at most `nowMs`), so an on-time input never rewinds and a late
 * one lands exactly where it would have landed on time. The design sketch writes `floor`, which would
 * rewind almost every input by one tick and apply it before the player acted.
 *
 * Display lag: by default the tick comes from `atMs` alone, because the room clock already removes
 * network lag. With `subtractDisplayLag: true` it comes from `atMs - displayLagMs` (CC-3.8), for games
 * where players react to something moving on the TV (Duck Season, Bandeja). The rewind stays capped
 * at 150 ms either way.
 *
 * When the input is applied, the game sees the original `atMs` and `displayLagMs`, and `nowMs` is the
 * time of the tick that applies it, as it would be on time.
 *
 * Costs: a rewind re-runs up to 10 `onTick` calls in one frame, so games that use it keep `onTick`
 * under 1 ms. History entries share structure with the states pure game functions return.
 *
 * Leaves: pass the game's `onPlayerLeft` too and use the returned one. It brings `now` up to date,
 * applies the leave and clears the history, so a later rewind can't re-simulate from before the leave
 * and undo it. Inputs in the next 200 ms rewind only as far as the ticks run since the leave. Seats
 * expire rarely (after 2 minutes away), so that costs little.
 *
 * Restore: `wrap` starts again at tick 1, like a game the host runner starts after `restore`.
 */
import { tickMs, tickTimeMs } from "../contract/index.ts";
import type { CouchcadeGame, GameInput, InputContext, Player } from "../contract/index.ts";

/** How much state history the helper keeps by default: 200 ms, 12 ticks. */
export const REWIND_HISTORY_MS = 200;

/** How far back an input may be applied by default: 150 ms, 9 ticks. */
export const REWIND_MAX_MS = 150;

export interface RewindOptions {
  /** State history to keep. Defaults to `REWIND_HISTORY_MS` (200 ms, 12 ticks). */
  historyMs?: number;
  /** Furthest rewind, never more than the history. Defaults to `REWIND_MAX_MS` (150 ms, 9 ticks). */
  maxRewindMs?: number;
  /** Judge the tick on `atMs - displayLagMs` instead of `atMs`. Defaults to false. */
  subtractDisplayLag?: boolean;
}

/** An input as the helper stores it. */
export interface RewoundInput<TInput extends GameInput = GameInput> {
  player: Player;
  input: TInput;
  /** The context the game receives: `nowMs` is the time of the tick that applies the input. */
  ctx: InputContext;
  /** Arrival order. Inputs of one tick apply in this order. */
  seq: number;
}

/** One tick that ran: the state before it and the inputs it applied. */
export interface RewoundTick<TState, TInput extends GameInput = GameInput> {
  tick: number;
  before: TState;
  inputs: readonly RewoundInput<TInput>[];
}

/** The wrapped state. Plain JSON when `TState` is. */
export interface Rewound<TState, TInput extends GameInput = GameInput> {
  /** The game state after tick `tick - 1`. */
  now: TState;
  /** The next tick to run. Tick 0 is `init`, so this starts at 1. */
  tick: number;
  /** Inputs for `tick`, in arrival order. */
  pending: readonly RewoundInput<TInput>[];
  /** The last ticks that ran, oldest first, without gaps. */
  history: readonly RewoundTick<TState, TInput>[];
  /** The earliest tick that received a late input since the last `onTick`, or null. */
  dirtyFrom: number | null;
  /** Inputs received so far, the next input's `seq`. */
  seq: number;
}

export interface RewindRules<TInput extends GameInput, TState> {
  init: CouchcadeGame<TInput, Rewound<TState, TInput>>["init"];
  onPlayerInput: CouchcadeGame<TInput, Rewound<TState, TInput>>["onPlayerInput"];
  onTick: NonNullable<CouchcadeGame<TInput, Rewound<TState, TInput>>["onTick"]>;
  /** The game's `onPlayerLeft` without a history to undo it. Returns the state unchanged without one. */
  onPlayerLeft: NonNullable<CouchcadeGame<TInput, Rewound<TState, TInput>>["onPlayerLeft"]>;
  /** The game state inside the wrapper, for `view`, `outcome` and `snapshot`. */
  unwrap(state: Rewound<TState, TInput>): TState;
  /** Wraps a game state with an empty history, for `restore`. */
  wrap(state: TState): Rewound<TState, TInput>;
}

/** Tolerance for float time: `tickTimeMs(k) / tickMs` can land a hair off `k`. */
const epsilon = 1e-9;

/** A game state with an empty history, before its first tick. */
function wrap<TState, TInput extends GameInput>(state: TState): Rewound<TState, TInput> {
  return { now: state, tick: 1, pending: [], history: [], dirtyFrom: null, seq: 0 };
}

/** Wraps a real-time game's rules so late inputs apply at the tick the player acted in. */
export function withRewind<TInput extends GameInput, TState>(
  rules: Pick<CouchcadeGame<TInput, TState>, "init" | "onPlayerInput" | "onTick" | "onPlayerLeft">,
  {
    historyMs = REWIND_HISTORY_MS,
    maxRewindMs = REWIND_MAX_MS,
    subtractDisplayLag = false,
  }: RewindOptions = {},
): RewindRules<TInput, TState> {
  const historyTicks = Math.round(historyMs / tickMs);
  if (!Number.isFinite(historyTicks) || historyTicks < 1) {
    throw new RangeError(`historyMs must be at least one tick, got ${historyMs}`);
  }
  if (!Number.isFinite(maxRewindMs) || maxRewindMs < 0) {
    throw new RangeError(`maxRewindMs must be 0 or more, got ${maxRewindMs}`);
  }
  const maxRewindTicks = Math.min(historyTicks, Math.floor(maxRewindMs / tickMs + epsilon));

  /** The tick an input applies in: when the player acted, within the reachable history. */
  const targetTick = (state: Rewound<TState, TInput>, ctx: InputContext): number => {
    const actedMs = subtractDisplayLag ? ctx.atMs - ctx.displayLagMs : ctx.atMs;
    const acted = Math.ceil(actedMs / tickMs - epsilon);
    if (!Number.isFinite(acted)) return state.tick;
    const oldest = Math.max(state.tick - maxRewindTicks, state.history[0]?.tick ?? state.tick);
    return Math.min(state.tick, Math.max(oldest, acted));
  };

  /** One tick of the game: inputs in arrival order, then its `onTick`. */
  const runTick = (
    before: TState,
    inputs: readonly RewoundInput<TInput>[],
    dtMs: number,
  ): TState => {
    let state = before;
    for (const { player, input, ctx } of inputs) {
      state = rules.onPlayerInput(state, player, input, ctx);
    }
    return rules.onTick ? rules.onTick(state, dtMs) : state;
  };

  /**
   * Re-simulates from the earliest dirty tick, if any. Returns the state after tick `tick - 1` and the
   * history entries from index `drop` on, with their `before` states brought up to date.
   */
  const settle = (state: Rewound<TState, TInput>, dtMs: number, drop: number) => {
    const { history } = state;
    const from =
      state.dirtyFrom === null
        ? history.length
        : state.dirtyFrom - (history[0]?.tick ?? state.tick);
    const kept: RewoundTick<TState, TInput>[] = [];

    let now =
      from < history.length ? (history[from] as RewoundTick<TState, TInput>).before : state.now;
    for (let i = 0; i < history.length; i++) {
      let entry = history[i] as RewoundTick<TState, TInput>;
      if (i >= from) {
        if (i > from) entry = { tick: entry.tick, before: now, inputs: entry.inputs };
        now = runTick(entry.before, entry.inputs, dtMs);
      }
      if (i >= drop) kept.push(entry);
    }
    return { now, kept };
  };

  return {
    init: (players, seed) => wrap(rules.init(players, seed)),

    onPlayerInput(state, player, input, ctx) {
      const tick = targetTick(state, ctx);
      const recorded: RewoundInput<TInput> = {
        player,
        input,
        ctx: { ...ctx, nowMs: tickTimeMs(tick) },
        seq: state.seq,
      };
      const seq = state.seq + 1;
      if (tick === state.tick) {
        return { ...state, pending: [...state.pending, recorded], seq };
      }

      const index = tick - (state.history[0]?.tick ?? state.tick);
      const history = state.history.map((entry, i) =>
        i === index ? { ...entry, inputs: [...entry.inputs, recorded] } : entry,
      );
      const dirtyFrom = state.dirtyFrom === null ? tick : Math.min(state.dirtyFrom, tick);
      return { ...state, history, dirtyFrom, seq };
    },

    onTick(state, dtMs) {
      // The oldest entries fall out once the new tick is added.
      const drop = Math.max(0, state.history.length + 1 - historyTicks);
      const { now, kept } = settle(state, dtMs, drop);
      kept.push({ tick: state.tick, before: now, inputs: state.pending });

      return {
        now: runTick(now, state.pending, dtMs),
        tick: state.tick + 1,
        pending: [],
        history: kept,
        dirtyFrom: null,
        seq: state.seq,
      };
    },

    onPlayerLeft(state, player) {
      if (!rules.onPlayerLeft) return state;
      const { now } = settle(state, tickMs, state.history.length);
      return { ...state, now: rules.onPlayerLeft(now, player), history: [], dirtyFrom: null };
    },

    unwrap: (state) => state.now,
    wrap,
  };
}
