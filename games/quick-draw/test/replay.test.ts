import { describe, expect, it } from "vitest";
import { replay } from "@couchcade/game-sdk/testing";
import type { Recording } from "@couchcade/game-sdk/testing";
import game from "../src/index.ts";
import recorded from "./recordings/three-player-match.json" with { type: "json" };

// A recorded 3-player match over a 120 ms network delay: a foul before DRAW!, a round where one
// player never taps, and a final round that two players win on the same millisecond.
describe("recorded match", () => {
  it("replays to the exact final state and outcome", () => {
    const state = replay(game, recorded.recording as Recording);
    expect(state).toStrictEqual(recorded.finalState);
    expect(game.outcome(state)).toStrictEqual(recorded.outcome);
  });
});
