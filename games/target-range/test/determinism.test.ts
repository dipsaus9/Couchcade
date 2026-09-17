import { array, assert, constantFrom, double, integer, property, record } from "fast-check";
import { describe, expect, it } from "vitest";
import { replay } from "@couchcade/game-sdk/testing";
import { tickMs } from "@couchcade/game-sdk/contract";
import game from "../src/index.ts";
import {
  arrowsPerRound,
  bullseyePoints,
  maxMatchPoints,
  roundCount,
  volleyCount,
} from "../src/shared/index.ts";
import type { TargetRangeInput } from "../src/shared/index.ts";
import { aim, lower, room, shoot } from "./helpers.ts";
import type { TargetRangeRoom } from "./helpers.ts";

const unit = double({ min: -1, max: 1, noNaN: true });

/** An input: after `gapTicks` more ticks, player `slot` sends it, made `ageMs` ago. */
const event = record({
  gapTicks: integer({ min: 0, max: 300 }),
  slot: integer({ min: 0, max: 7 }),
  kind: constantFrom("aim", "shoot", "lower"),
  volley: integer({ min: 1, max: volleyCount }),
  yaw: unit,
  pitch: unit,
  power: double({ min: 0.3, max: 1, noNaN: true }),
  ageMs: integer({ min: 0, max: 700 }),
});

const match = record({
  seed: integer({ min: 0, max: 2 ** 32 - 1 }),
  players: integer({ min: 1, max: 8 }),
  events: array(event, { maxLength: 120 }),
});

type Match = {
  seed: number;
  players: number;
  events: Array<{
    gapTicks: number;
    slot: number;
    kind: "aim" | "shoot" | "lower";
    volley: number;
    yaw: number;
    pitch: number;
    power: number;
    ageMs: number;
  }>;
};

function inputOf({ kind, volley, yaw, pitch, power }: Match["events"][number]): TargetRangeInput {
  if (kind === "aim") return aim([-67, yaw, pitch], [0, pitch, yaw]);
  return kind === "shoot" ? shoot(volley, yaw, pitch, power) : lower(volley);
}

/** Plays the inputs in a fake room, then runs the match to its end. */
function play({ seed, players, events }: Match): TargetRangeRoom {
  const target = room(players, seed);
  for (const generated of events) {
    target.step(generated.gapTicks);
    const player = target.players[generated.slot % players];
    target.input(
      player?.id as string,
      inputOf(generated),
      Math.max(0, target.nowMs + tickMs - generated.ageMs),
    );
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
      { numRuns: 40 },
    );
  });

  it("always finishes after 4 rounds with sane scores", () => {
    assert(
      property(match, (generated) => {
        const { state } = play(generated);
        expect(state).toMatchObject({ phase: "over", round: roundCount, arrow: arrowsPerRound });
        for (const player of state.players) {
          expect(player.points).toBeGreaterThanOrEqual(0);
          expect(player.points).toBeLessThanOrEqual(maxMatchPoints);
          expect(player.tens * bullseyePoints).toBeLessThanOrEqual(player.points);
        }
      }),
      { numRuns: 40 },
    );
  });
});
