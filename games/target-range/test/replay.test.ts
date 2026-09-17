import { describe, expect, it } from "vitest";
import { replay } from "@couchcade/game-sdk/testing";
import type { Recording } from "@couchcade/game-sdk/testing";
import game from "../src/index.ts";
import type { VolleyResult } from "../src/shared/index.ts";
import { stepThrough } from "./helpers.ts";
import recorded from "./recordings/three-player-match.json" with { type: "json" };

// A recorded 3-player match over a 120 ms network delay, with aim streams in volleys 1, 4 and 9,
// shots at full, 80% and 50% draw in every round's wind, a draw let go too early and redrawn in
// volley 4, no arrow from player 3 in volley 6, and a late arrow from player 3 in volley 9.
const recording = recorded.recording as Recording;

describe("recorded match", () => {
  it("replays to the exact final state and outcome", () => {
    const state = replay(game, recording);
    expect(state).toStrictEqual(recorded.finalState);
    expect(game.outcome(state)).toStrictEqual(recorded.outcome);
  });

  it("covers a lower, a volley without an arrow and a late arrow", () => {
    expect(recording.events.some((event) => event.input.type === "lower")).toBe(true);
    const third: Array<VolleyResult | null> = [];
    const target = stepThrough(recording, (step, before) => {
      if (before.phase === "landing" && step.state.phase === "reveal") {
        third.push(step.state.players[2]!.last);
      }
    });
    expect(third).toHaveLength(12);
    expect(third[5]).toBe("none");
    expect(third[8]).toBe("late");
    expect(target.state).toStrictEqual(recorded.finalState);
  });
});
