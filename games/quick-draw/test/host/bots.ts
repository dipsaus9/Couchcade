import { tickTimeMs } from "@couchcade/game-sdk/contract";
import { createPlayers } from "@couchcade/game-sdk/testing";
import type { QuickDrawState } from "../../src/shared/index.ts";
import { room, tap } from "../helpers.ts";
import type { QuickDrawRoom } from "../helpers.ts";

/** A bot's tap in a round, in ms relative to DRAW! (negative is early), or null for no tap. */
export type BotPlan = (round: number, slot: number) => number | null;

const mixedReactions: readonly (number | null)[] = [243, 301, -400, null];
/**
 * Bots for scene tests: slot 0 reacts in 243 ms, slot 1 in 301 ms, slot 2 fouls 400 ms before
 * DRAW!, slot 3 never taps, the rest react in 350 ms and more. Covers valid, foul and slow.
 */
export const mixedBots: BotPlan = (_round, slot) =>
  slot < mixedReactions.length ? (mixedReactions[slot] ?? null) : 350 + slot;

/**
 * A room whose bots tap per `plan`. Call `step()` once per frame: it queues the taps due on the
 * next tick and runs that tick, like the host runtime does between two TV frames.
 */
export function botRoom(
  players: number,
  seed: number,
  plan: BotPlan,
): { room: QuickDrawRoom; step: () => QuickDrawState } {
  const target = room(createPlayers(players), seed);
  let plannedRound = 0;
  let pending: Array<{ playerId: string; atMs: number; round: number }> = [];

  const step = (): QuickDrawState => {
    const { state } = target;
    if (state.phase === "standoff" && plannedRound !== state.round && state.drawDueMs !== null) {
      plannedRound = state.round;
      const drawDueMs = state.drawDueMs;
      pending = state.players.flatMap((player, slot) => {
        const reaction = plan(state.round, slot);
        return reaction === null
          ? []
          : [{ playerId: player.id, atMs: drawDueMs + reaction, round: state.round }];
      });
    }
    const nextMs = tickTimeMs(target.tick + 1);
    pending = pending.filter((entry) => {
      if (entry.atMs > nextMs + 1e-6) return true;
      target.input(entry.playerId, tap(entry.round), entry.atMs);
      return false;
    });
    return target.step();
  };
  return { room: target, step };
}

/**
 * Bots that take turns: in round n, slot (n - 1) reacts fastest, the next slot fouls and the one
 * after never taps. Nobody reaches 3 points, so the match runs all 9 rounds.
 */
export const rotatingBots: BotPlan = (round, slot) => {
  const fastest = (round - 1) % 8;
  if (slot === fastest) return 220;
  if (slot === (fastest + 1) % 8) return -400;
  if (slot === (fastest + 2) % 8) return null;
  return 300 + slot * 10;
};

/** The first seed from 1 whose match shows a fake word, a crow and a glint, without rendering. */
export function seedWithEveryFake(players: number, plan: BotPlan): number {
  for (let seed = 1; seed < 1000; seed++) {
    const bots = botRoom(players, seed, plan);
    const kinds = new Set<string>();
    while (!bots.room.over) {
      for (const fake of bots.step().fakes) kinds.add(fake.kind);
    }
    if (kinds.size === 3) return seed;
  }
  throw new Error("No seed under 1000 shows every fake");
}
