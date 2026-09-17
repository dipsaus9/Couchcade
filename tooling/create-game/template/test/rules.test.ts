import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import {
  init,
  onPlayerInput,
  outcome,
  restore,
  snapshot,
  winningTaps,
} from "../src/shared/rules.ts";

const [alice, bob] = createPlayers(2) as [
  ReturnType<typeof createPlayers>[number],
  ReturnType<typeof createPlayers>[number],
];

const tap = { type: "tap" as const };

describe("__TITLE__ rules: first to 5 taps wins", () => {
  it("starts everyone at 0 taps with no winner", () => {
    const state = init([alice, bob], 1);
    expect(state.taps).toEqual({ [alice.id]: 0, [bob.id]: 0 });
    expect(state.winnerId).toBeNull();
    expect(outcome(state)).toBeNull();
  });

  it("counts a tap once per input", () => {
    const state = onPlayerInput(init([alice, bob], 1), alice, tap);
    expect(state.taps[alice.id]).toBe(1);
    expect(state.taps[bob.id]).toBe(0);
  });

  it("declares the first player to reach the winning tap count", () => {
    let state = init([alice, bob], 1);
    for (let i = 0; i < winningTaps; i++) state = onPlayerInput(state, alice, tap);
    expect(state.winnerId).toBe(alice.id);

    const decided = outcome(state);
    expect(decided).not.toBeNull();
    expect(decided?.placements).toEqual(
      expect.arrayContaining([{ playerId: alice.id, place: 1, score: winningTaps }]),
    );
  });

  it("ignores taps once the match is decided", () => {
    let state = init([alice, bob], 1);
    for (let i = 0; i < winningTaps; i++) state = onPlayerInput(state, alice, tap);
    const decided = state;
    const after = onPlayerInput(decided, bob, tap);
    expect(after).toStrictEqual(decided);
  });

  it("restores from its own snapshot", () => {
    let state = onPlayerInput(init([alice, bob], 1), alice, tap);
    state = onPlayerInput(state, alice, tap);
    const restored = restore([alice, bob], 2, snapshot(state));
    expect(restored.taps).toEqual(state.taps);
    expect(restored.winnerId).toBe(state.winnerId);
  });

  it("starts fresh from a snapshot that isn't valid data", () => {
    const restored = restore([alice, bob], 1, null);
    expect(restored).toStrictEqual(init([alice, bob], 1));
  });
});
