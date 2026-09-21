import * as z from "zod/mini";
import type { Player } from "@couchcade/game-sdk/contract";
import type { JsonValue } from "@couchcade/protocol";
import { course } from "./course.ts";
import { holeCount, strokeCap, turnTimerMs } from "./constants.ts";
import { honourSeat, init } from "./state.ts";
import type { PuttClubSnapshot, PuttClubState } from "./state.ts";

const count = z.int().check(z.gte(0));
/** A finished hole's score: 1 to `strokeCap`. */
const holeScore = z.int().check(z.gte(1), z.lte(strokeCap));

/**
 * `{ h, str, sc }`: the hole to resume at, total strokes by player id, and each player's finished
 * holes' scores in order, so a restored scorecard can still show them (docs/games/putt-club.md,
 * "Edge cases": "TV refresh or deploy mid-hole"). No positions.
 */
const snapshotSchema = z.object({
  h: z.int().check(z.gte(1)),
  str: z.record(z.string(), count),
  sc: z.record(z.string(), z.array(holeScore)),
});

/**
 * The state to resume from. It only changes at a `holeEnd` boundary: during a hole it describes
 * that hole's start, from `holeEnd` on it describes the start of the next hole. A finished match
 * points past `holeCount`.
 */
export function snapshot(state: PuttClubState): PuttClubSnapshot {
  return state.holeStart;
}

/**
 * Resumes at the honour seat of the hole in the snapshot, game time back at 0 as after `init` and
 * every ball back on that hole's tee (no positions are stored). Players missing from the snapshot
 * start at 0 strokes. A snapshot that doesn't parse starts a new match. A finished match restores
 * as `over`. `turn` restarts at 1: it only guards a stale `line`/`putt` against the *current* turn,
 * so a fresh count after a restore is exactly as safe as `init`'s.
 */
export function restore(players: readonly Player[], seed: number, data: JsonValue): PuttClubState {
  const fresh = init(players, seed);
  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) return fresh;
  const saved = parsed.data;

  const restoredPlayers = fresh.players.map((player) => {
    const scores = saved.sc[player.id] ?? [];
    return {
      ...player,
      total: saved.str[player.id] ?? 0,
      scores: player.scores.map((score, index) =>
        index < scores.length ? (scores[index] as number) : score,
      ),
    };
  });

  if (saved.h > holeCount) {
    return {
      ...fresh,
      players: restoredPlayers,
      phase: "over",
      hole: holeCount,
      putterId: null,
      holeStart: saved,
    };
  }

  const tee = course[saved.h - 1]?.tee ?? [0, 0];
  const onTee = restoredPlayers.map((player) => ({
    ...player,
    ball: tee,
    doneHole: false,
    strokes: 0,
    last: null,
  }));
  const firstPutterId =
    onTee.find((player) => player.seat === honourSeat(saved.h, onTee.length))?.id ?? null;

  return {
    ...fresh,
    players: onTee,
    hole: saved.h,
    phase: "turn",
    turn: 1,
    putterId: firstPutterId,
    phaseAtMs: 0,
    deadlineMs: turnTimerMs,
    awayAtTurnStart: false,
    aim: [],
    locked: false,
    activeStroke: null,
    holeStart: saved,
  };
}
