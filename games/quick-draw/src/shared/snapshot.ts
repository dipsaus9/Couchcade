import * as z from "zod/mini";
import type { Player } from "@couchcade/game-sdk/contract";
import type { JsonValue } from "@couchcade/protocol";
import { maxRounds, targetPoints } from "./constants.ts";
import { init } from "./state.ts";
import type { QuickDrawState } from "./state.ts";

/**
 * What a refreshed TV needs to resume at the next round's intro. `players` maps an id to
 * `[points, bestMs]`. Under 300 bytes for 8 players. Solo practice adds `practice`:
 * `[totalMs, validTaps]`, so the average survives a refresh.
 */
const snapshotSchema = z.object({
  round: z.int().check(z.gte(1)),
  rng: z.int().check(z.gte(0)),
  words: z.int().check(z.gte(0)),
  players: z.record(z.string(), z.tuple([z.int().check(z.gte(0)), z.nullable(z.number())])),
  practice: z.optional(z.tuple([z.int().check(z.gte(0)), z.int().check(z.gte(0))])),
});

export type QuickDrawSnapshot = z.infer<typeof snapshotSchema>;

/**
 * The state to resume from. It only changes when a round resolves (session-flow.md, "When the
 * host sends a snapshot"): during a round it still describes the start of that round, from the
 * `result` phase on it describes the start of the next one.
 */
export function snapshot(state: QuickDrawState): QuickDrawSnapshot {
  const resolved = state.phase === "result" || state.phase === "over";
  const rolled = state.phase === "standoff" || state.phase === "draw";
  return {
    round: resolved ? state.round + 1 : state.round,
    rng: rolled ? state.roundStart.rng : state.rng,
    words: rolled ? state.roundStart.wordsShown : state.wordsShown,
    players: Object.fromEntries(
      state.players.map((player) => [player.id, [player.points, player.bestMs]]),
    ),
    ...(state.practice ? { practice: [state.practice.totalMs, state.practice.validTaps] } : {}),
  };
}

/**
 * Resumes at the intro of the round in the snapshot, with game time back at 0 as after `init`.
 * Players missing from the snapshot start at 0 points. A snapshot that doesn't parse starts a
 * new match. A decided match restores as `over`.
 */
export function restore(players: readonly Player[], seed: number, data: JsonValue): QuickDrawState {
  const fresh = init(players, seed);
  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) return fresh;
  const saved = parsed.data;

  const state: QuickDrawState = {
    ...fresh,
    round: Math.min(saved.round, maxRounds),
    rng: saved.rng,
    wordsShown: saved.words,
    roundStart: { rng: saved.rng, wordsShown: saved.words },
    players: fresh.players.map((player) => {
      const [points, bestMs] = saved.players[player.id] ?? [0, null];
      return { ...player, points, bestMs };
    }),
    ...(fresh.practice && saved.practice
      ? {
          practice: { totalMs: saved.practice[0], validTaps: saved.practice[1], newBest: false },
        }
      : {}),
  };
  const decided =
    saved.round > maxRounds || state.players.some((player) => player.points >= targetPoints);
  return decided ? { ...state, phase: "over" } : state;
}
