/**
 * Fixture game for the SDK tests: a turn-based guessing game without `onTick`. Everyone guesses
 * the seeded secret number once, and the closest guess wins. It has `onPlayerLeft`, `snapshot`
 * and `restore`, so the contract test kit checks the optional hooks too.
 */
import * as z from "zod/mini";
import { createRng } from "@couchcade/utils";
import { defineGame } from "@couchcade/game-sdk/contract";
import type { Outcome, Player } from "@couchcade/game-sdk/contract";
import type { JsonValue } from "@couchcade/protocol";

const inputSchema = z.object({
  type: z.literal("guess"),
  payload: z.object({ value: z.int().check(z.gte(1), z.lte(9)) }),
});

export interface PickANumberState {
  secret: number;
  guesses: Record<string, number | null>;
  left: string[];
}

export type PickANumberView = { guess: number | null; secret: number | null };

function init(players: readonly Player[], seed: number): PickANumberState {
  return {
    secret: createRng(seed).int(1, 9),
    guesses: Object.fromEntries(players.map((player) => [player.id, null])),
    left: [],
  };
}

const snapshotSchema = z.object({ guesses: z.record(z.string(), z.nullable(z.int())) });

function isDone(state: PickANumberState): boolean {
  return Object.entries(state.guesses).every(
    ([id, guess]) => guess !== null || state.left.includes(id),
  );
}

export default defineGame({
  id: "pick-a-number",
  title: "Best guess",
  players: { min: 1, max: 8 },
  realtime: false,
  needsMotion: false,
  scene: "alley",
  inputSchema,

  init,

  onPlayerInput(state, player, input) {
    if (isDone(state) || state.guesses[player.id] !== null) return state;
    return { ...state, guesses: { ...state.guesses, [player.id]: input.payload.value } };
  },

  onPlayerLeft(state, player) {
    return state.left.includes(player.id) ? state : { ...state, left: [...state.left, player.id] };
  },

  view(state, player) {
    const done = isDone(state);
    return {
      screen: done ? "pn-result" : "pn-guess",
      data: { guess: state.guesses[player.id] ?? null, secret: done ? state.secret : null },
    };
  },

  outcome(state): Outcome | null {
    if (!isDone(state)) return null;
    const distances = Object.entries(state.guesses).map(([playerId, guess]) => ({
      playerId,
      distance: guess === null ? Infinity : Math.abs(guess - state.secret),
    }));
    return {
      placements: distances.map(({ playerId, distance }) => ({
        playerId,
        place: 1 + distances.filter((other) => other.distance < distance).length,
      })),
    };
  },

  snapshot: (state): JsonValue => ({ guesses: state.guesses }),

  restore(players, seed, snapshot) {
    const state = init(players, seed);
    const parsed = snapshotSchema.safeParse(snapshot);
    return parsed.success
      ? { ...state, guesses: { ...state.guesses, ...parsed.data.guesses } }
      : state;
  },

  hostScene: () => Promise.reject(new Error("Fixture games have no host scene")),
});
