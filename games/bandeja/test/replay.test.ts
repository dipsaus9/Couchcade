import { describe, expect, it } from "vitest";
import { createFakeRoom, createPlayers, replay } from "@couchcade/game-sdk/testing";
import type { FakeRoom } from "@couchcade/game-sdk/testing";
import type { Rewound } from "@couchcade/game-sdk/rewind";
import game from "../src/index.ts";
import { findPlayerBySlot } from "../src/shared/index.ts";
import type { BandejaInput, BandejaState, BandejaView, SlotName } from "../src/shared/index.ts";

type Room = FakeRoom<BandejaInput, Rewound<BandejaState, BandejaInput>, BandejaView>;

/** Steps until the ball has an arrival for some slot, and returns which one and when. */
function waitForAnyArrival(target: Room): { slot: SlotName; arriveAt: number } {
  for (let i = 0; i < 60 * 60 * 20; i++) {
    if (target.over) throw new Error("Match ended before any arrival");
    const arrivals = target.state.now.ball?.leg.arrivals;
    if (arrivals !== undefined) {
      const entry = Object.entries(arrivals)[0];
      if (entry !== undefined) return { slot: entry[0] as SlotName, arriveAt: entry[1] as number };
    }
    target.step();
  }
  throw new Error("Match never produced an arrival");
}

function stepToTick(target: Room, atMs: number): void {
  while (target.nowMs < atMs) {
    if (target.over) return;
    target.step();
  }
}

/**
 * Records a short 2-player match (docs/games/bandeja.md, acceptance criterion 5): the platform
 * intro, a real accepted swing (found by watching the ball's own predicted arrival, the same way
 * a host would react to it), several unswung points settled by the double-bounce rule, then checks
 * the recording replays to the exact same final state and outcome.
 */
describe("recorded match", () => {
  it("replays to the exact final state and outcome", () => {
    const players = createPlayers(2);
    const room: Room = createFakeRoom(game, { players, seed: 7 });

    // Point 1: a real swing, timed off the ball's own predicted arrival.
    const { slot, arriveAt } = waitForAnyArrival(room);
    const swinger = findPlayerBySlot(room.state.now, slot);
    if (swinger !== undefined) {
      stepToTick(room, arriveAt);
      room.input(
        swinger.id,
        { type: "swing", payload: { point: room.state.now.point, speed: 0.7, angle: -20 } },
        arriveAt,
      );
    }

    // Let the rest of a short match play out on its own (whiffs and the odd double bounce all
    // settle the same way every time from a fixed seed): reach at least a second point.
    for (let i = 0; i < 60 * 60 * 30 && room.state.now.point < 3 && !room.over; i++) room.step();

    const recording = JSON.parse(JSON.stringify(room.recording()));
    expect(recording.events.length).toBeGreaterThan(0);
    expect(
      recording.events.some((event: { input: { type: string } }) => event.input.type === "swing"),
    ).toBe(true);

    const replayed = replay(game, recording);
    expect(replayed).toStrictEqual(room.state);
    expect(game.outcome(replayed)).toStrictEqual(game.outcome(room.state));
  });
});
