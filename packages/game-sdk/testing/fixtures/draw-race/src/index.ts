/**
 * Fixture game for the SDK tests, shaped like Quick Draw (docs/games/quick-draw.md): wait for GO,
 * then tap first. A tap less than 100 ms after GO is a foul, a foul soon after the fake cue is
 * "fooled", and taps are judged on room-clock time (`ctx.atMs`), not on arrival.
 */
import * as z from "zod/mini";
import { createRng } from "@couchcade/utils";
import { defineGame } from "@couchcade/game-sdk/contract";
import type { Outcome } from "@couchcade/game-sdk/contract";

export const falseStartMs = 100;
export const fooledWindowMs = 1000;
export const tapWindowMs = 2000;

const inputSchema = z.object({ type: z.literal("tap") });

type Result = { kind: "foul" | "fooled" } | { kind: "valid"; ms: number };

export interface DrawRaceState {
  nowMs: number;
  fakeAtMs: number;
  goAtMs: number;
  results: Record<string, Result | null>;
  done: boolean;
}

export type DrawRaceView = { result: Result["kind"] | null; ms: number | null };

const noHostScene = () => Promise.reject(new Error("Fixture games have no host scene"));

export default defineGame({
  id: "draw-race",
  title: "Draw race",
  players: { min: 2, max: 8 },
  realtime: true,
  needsMotion: false,
  scene: "desert",
  inputSchema,

  init(players, seed): DrawRaceState {
    const rng = createRng(seed);
    const fakeAtMs = rng.int(500, 1500);
    return {
      nowMs: 0,
      fakeAtMs,
      goAtMs: fakeAtMs + rng.int(1000, 3000),
      results: Object.fromEntries(players.map((player) => [player.id, null])),
      done: false,
    };
  },

  onPlayerInput(state, player, _input, ctx) {
    if (state.done || state.results[player.id] !== null) return state;
    const reactionMs = Math.round(ctx.atMs - state.goAtMs);
    const fooled = ctx.atMs >= state.fakeAtMs && ctx.atMs < state.fakeAtMs + fooledWindowMs;
    const result: Result =
      reactionMs >= falseStartMs
        ? { kind: "valid", ms: reactionMs }
        : { kind: fooled ? "fooled" : "foul" };
    return { ...state, results: { ...state.results, [player.id]: result } };
  },

  onTick(state, dtMs) {
    const nowMs = state.nowMs + dtMs;
    const everyoneTapped = Object.values(state.results).every((result) => result !== null);
    const done = state.done || nowMs >= state.goAtMs + tapWindowMs || everyoneTapped;
    return { ...state, nowMs, done };
  },

  view(state, player) {
    const result = state.results[player.id] ?? null;
    return {
      screen: state.done ? "dr-result" : "dr-standoff",
      data: { result: result?.kind ?? null, ms: result?.kind === "valid" ? result.ms : null },
      ...(result !== null && result.kind !== "valid" ? { cue: "foul" as const } : {}),
    };
  },

  outcome(state): Outcome | null {
    if (!state.done) return null;
    const times = Object.entries(state.results).map(([playerId, result]) => ({
      playerId,
      ms: result?.kind === "valid" ? result.ms : Infinity,
    }));
    return {
      placements: times.map(({ playerId, ms }) => ({
        playerId,
        place: 1 + times.filter((other) => other.ms < ms).length,
      })),
    };
  },

  hostScene: noHostScene,
});
