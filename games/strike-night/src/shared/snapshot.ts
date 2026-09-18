import * as z from "zod/mini";
import type { Player } from "@couchcade/game-sdk/contract";
import type { JsonValue } from "@couchcade/protocol";
import { frameCount, turnTimerMs } from "./constants.ts";
import { allPinIds, init } from "./state.ts";
import type { StrikeNightSnapshot, StrikeNightState } from "./state.ts";

const count = z.int().check(z.gte(0));
/** A strike is fixed at 30, a spare 10 to 19, an open frame 0 to 9. */
const frameScore = z.int().check(z.gte(0), z.lte(30));

/**
 * `{ f, pts, st, sp, fr }`: the frame to resume at, points/strikes/spares by player id, and each
 * player's completed frame scores in order, so a restored scorecard can still show them
 * (docs/games/strike-night.md, "Edge cases": "TV refresh or deploy mid-frame"). No positions.
 */
const snapshotSchema = z.object({
  f: z.int().check(z.gte(1)),
  pts: z.record(z.string(), count),
  st: z.record(z.string(), count),
  sp: z.record(z.string(), count),
  fr: z.record(z.string(), z.array(frameScore)),
});

/**
 * The state to resume from. It only changes at a `frameEnd` boundary (session-flow.md, "When the
 * host sends a snapshot"): during a frame it describes that frame's start, from `frameEnd` on it
 * describes the start of the next frame. A finished match points past `frameCount`.
 */
export function snapshot(state: StrikeNightState): StrikeNightSnapshot {
  return state.frameStart;
}

/**
 * Resumes at the first bowler of the frame in the snapshot, with game time back at 0 as after
 * `init` and every player back at `x = 0` (no positions are stored). Players missing from the
 * snapshot start at 0 points. A snapshot that doesn't parse starts a new match. A finished match
 * restores as `over`. `turn` restarts at 1: it only guards a stale `bowl`/`move`/`grip` against
 * the *current* lineup, so a fresh count after a restore is exactly as safe as `init`'s.
 */
export function restore(
  players: readonly Player[],
  seed: number,
  data: JsonValue,
): StrikeNightState {
  const fresh = init(players, seed);
  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) return fresh;
  const saved = parsed.data;

  const restoredPlayers = fresh.players.map((player) => {
    const scores = saved.fr[player.id] ?? [];
    return {
      ...player,
      total: saved.pts[player.id] ?? 0,
      strikes: saved.st[player.id] ?? 0,
      spares: saved.sp[player.id] ?? 0,
      frames: player.frames.map((frame, index) =>
        index < scores.length
          ? { roll1: null, roll2: null, score: scores[index] as number }
          : frame,
      ),
    };
  });

  if (saved.f > frameCount) {
    return {
      ...fresh,
      players: restoredPlayers,
      phase: "over",
      frame: frameCount,
      frameStart: saved,
    };
  }

  const firstBowler = restoredPlayers[0];
  return {
    ...fresh,
    players: restoredPlayers,
    frame: saved.f,
    phase: "lineup",
    turn: 1,
    roll: 1,
    bowlerId: firstBowler?.id ?? null,
    phaseAtMs: 0,
    deadlineMs: turnTimerMs,
    awayAtLineupStart: false,
    standingPins: [...allPinIds],
    activeRoll: null,
    frameStart: saved,
  };
}
