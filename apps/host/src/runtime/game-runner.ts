import { clampInputAtMs, tickMs, tickTimeMs } from "@couchcade/game-sdk/contract";
import type {
  CouchcadeGame,
  GameInput,
  InputContext,
  Outcome,
  Player,
} from "@couchcade/game-sdk/contract";
import type { ControllerView, PayloadOf } from "@couchcade/protocol";

export type InputPayload = PayloadOf<"input">;

export interface GameRunnerOptions {
  /** The seated players at the start, in join order. Later joiners wait for the next game. */
  players: readonly Player[];
  seed: number;
  /** Calibrated TV lag (CC-3.8), 0 until then. */
  displayLagMs: number;
}

export interface GameRunner {
  readonly game: CouchcadeGame;
  /** The in-game players: the ones `init` received. */
  readonly players: readonly Player[];
  readonly seed: number;
  readonly state: unknown;
  /** Ticks run since `init`. */
  readonly tick: number;
  /** The outcome once the game ended, null while it runs. */
  readonly outcome: Outcome | null;
  /**
   * Sets the room time of tick 0. Inputs are judged against it, so call it when ticking starts,
   * after the scene loaded, not at `init`.
   */
  begin(roomTimeMs: number): void;
  /**
   * Queues an input for the next tick. Returns false and drops it when the sender isn't in this
   * game or the input fails the game's `inputSchema`.
   */
  queue(from: string, input: InputPayload): boolean;
  /**
   * A player's seat was freed (expired, left or kicked). Calls the game's `onPlayerLeft` once for
   * an in-game player, drops their later inputs and stops computing their view. A short drop is
   * never reported here: games only hear about a player whose seat is gone
   * (docs/architecture/session-flow.md, owner decision 8).
   */
  leave(id: string): void;
  /** One fixed step: queued inputs in arrival order, `onTick` if real-time, then `outcome`. */
  step(): Outcome | null;
  /** The view of every in-game player still seated, in join order. */
  views(): Map<string, ControllerView>;
}

interface QueuedInput {
  player: Player;
  input: GameInput;
  /** Room time when the player acted. */
  at: number;
}

/**
 * Runs one game on the host (docs/architecture/platform.md, "How the host runs a game", steps 2 to
 * 4). It owns no timer and no socket, so tests step it by hand.
 */
export function createGameRunner(game: CouchcadeGame, options: GameRunnerOptions): GameRunner {
  const players = [...options.players];
  const byId = new Map(players.map((player) => [player.id, player]));
  let state = game.init(players, options.seed);
  let tick = 0;
  let startRoomMs = 0;
  let outcome = game.outcome(state);
  let pending: QueuedInput[] = [];

  return {
    game,
    players,
    seed: options.seed,
    get state() {
      return state;
    },
    get tick() {
      return tick;
    },
    get outcome() {
      return outcome;
    },

    begin(roomTimeMs) {
      startRoomMs = roomTimeMs;
    },

    queue(from, { type, payload, at }) {
      const player = byId.get(from);
      if (player === undefined || outcome !== null) return false;
      const parsed = game.inputSchema.safeParse(
        payload === undefined ? { type } : { type, payload },
      );
      if (!parsed.success) return false;
      pending.push({ player, input: parsed.data, at });
      return true;
    },

    leave(id) {
      const player = byId.get(id);
      if (player === undefined) return;
      byId.delete(id);
      pending = pending.filter((queued) => queued.player.id !== id);
      if (outcome !== null || !game.onPlayerLeft) return;
      state = game.onPlayerLeft(state, player);
      outcome = game.outcome(state);
    },

    step() {
      if (outcome !== null) return outcome;
      tick += 1;
      const nowMs = tickTimeMs(tick);
      const inputs = pending;
      pending = [];
      for (const { player, input, at } of inputs) {
        const ctx: InputContext = {
          atMs: clampInputAtMs(at - startRoomMs, nowMs),
          nowMs,
          displayLagMs: options.displayLagMs,
        };
        state = game.onPlayerInput(state, player, input, ctx);
      }
      if (game.realtime && game.onTick) state = game.onTick(state, tickMs);
      outcome = game.outcome(state);
      return outcome;
    },

    views() {
      const seated = players.filter((player) => byId.has(player.id));
      return new Map(seated.map((player) => [player.id, game.view(state, player)]));
    },
  };
}
