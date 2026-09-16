import { array, assert, integer, property, record } from "fast-check";
import { describe, expect, it } from "vitest";
import { replay } from "@couchcade/game-sdk/testing";
import { tickMs } from "@couchcade/game-sdk/contract";
import game from "../src/index.ts";
import { maxRounds, targetPoints } from "../src/shared/index.ts";
import { room, tap } from "./helpers.ts";
import type { QuickDrawRoom } from "./helpers.ts";

/** A tap: after `gapTicks` more ticks, player `slot` taps for `round`, made `ageMs` ago. */
const tapEvent = record({
  gapTicks: integer({ min: 0, max: 400 }),
  slot: integer({ min: 0, max: 7 }),
  round: integer({ min: 1, max: maxRounds }),
  ageMs: integer({ min: 0, max: 700 }),
});

const match = record({
  seed: integer({ min: 0, max: 2 ** 32 - 1 }),
  players: integer({ min: 2, max: 8 }),
  taps: array(tapEvent, { maxLength: 60 }),
});

interface Match {
  seed: number;
  players: number;
  taps: Array<{ gapTicks: number; slot: number; round: number; ageMs: number }>;
}

/** Plays the taps in a fake room, then runs the match to its end. */
function play({ seed, players, taps }: Match): QuickDrawRoom {
  const target = room(players, seed);
  for (const { gapTicks, slot, round, ageMs } of taps) {
    target.step(gapTicks);
    const player = target.players[slot % players];
    target.input(player?.id as string, tap(round), Math.max(0, target.nowMs + tickMs - ageMs));
  }
  target.runToEnd();
  return target;
}

describe("determinism", () => {
  it("gives the same final state and outcome for the same seed and inputs", () => {
    assert(
      property(match, (generated) => {
        const first = play(generated);
        const second = play(structuredClone(generated));
        expect(second.state).toStrictEqual(first.state);
        expect(second.outcome()).toStrictEqual(first.outcome());
        expect(replay(game, JSON.parse(JSON.stringify(first.recording())))).toStrictEqual(
          first.state,
        );
      }),
      { numRuns: 60 },
    );
  });

  it("always finishes within 9 rounds with sane points", () => {
    assert(
      property(match, (generated) => {
        const { state } = play(generated);
        const points = state.players.map((player) => player.points);
        expect(state.phase).toBe("over");
        expect(state.round).toBeLessThanOrEqual(maxRounds);
        expect(Math.max(...points)).toBeLessThanOrEqual(targetPoints);
        expect(Math.max(...points)).toBeLessThanOrEqual(state.round);
        expect(state.round === maxRounds || Math.max(...points) === targetPoints).toBe(true);
      }),
      { numRuns: 60 },
    );
  });
});
