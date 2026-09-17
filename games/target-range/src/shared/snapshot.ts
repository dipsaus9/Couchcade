import * as z from "zod/mini";
import type { Player } from "@couchcade/game-sdk/contract";
import type { JsonValue } from "@couchcade/protocol";
import { arrowsPerRound, roundCount } from "./constants.ts";
import { init, scoresSnapshot, startRound } from "./state.ts";
import type { TargetRangeSnapshot, TargetRangeState } from "./state.ts";

const count = z.int().check(z.gte(0));

/**
 * `{ r, pts, tens, rng }`: the round to play next, points and bullseyes by player id, and the RNG
 * state to roll that round with. Keyed by id, so a TV that restores with the seats in another
 * order never swaps scores. Under 300 bytes for 8 players.
 */
const snapshotSchema = z.object({
  r: z.int().check(z.gte(1)),
  pts: z.record(z.string(), count),
  tens: z.record(z.string(), count),
  rng: count,
});

/**
 * The state to resume from. It only changes when a round ends (session-flow.md, "When the host
 * sends a snapshot"): during a round it describes that round's start, from `roundEnd` on it
 * describes the start of the next round. A finished match points past round 4.
 */
export function snapshot(state: TargetRangeState): TargetRangeSnapshot {
  if (state.phase === "over") return scoresSnapshot(state, roundCount + 1, state.rng);
  if (state.phase === "roundEnd") return scoresSnapshot(state, state.round + 1, state.rng);
  return state.roundStart;
}

/**
 * Resumes at the intro of the round in the snapshot, with game time back at 0 as after `init`, and
 * the same target and winds that round would have had. Players missing from the snapshot start at
 * 0 points. A snapshot that doesn't parse starts a new match. A finished match restores as `over`.
 */
export function restore(
  players: readonly Player[],
  seed: number,
  data: JsonValue,
): TargetRangeState {
  const fresh = init(players, seed);
  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) return fresh;
  const saved = parsed.data;

  const scored: TargetRangeState = {
    ...fresh,
    rng: saved.rng,
    players: fresh.players.map((player) => ({
      ...player,
      points: saved.pts[player.id] ?? 0,
      tens: saved.tens[player.id] ?? 0,
    })),
  };
  if (saved.r > roundCount) {
    return { ...scored, phase: "over", round: roundCount, arrow: arrowsPerRound };
  }
  return startRound(scored, saved.r);
}
