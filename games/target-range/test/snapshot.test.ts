import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { init, restore, snapshot, volleyOf } from "../src/shared/index.ts";
import type { TargetRangeState } from "../src/shared/index.ts";
import { playMatch, stepThrough, stepUntil } from "./helpers.ts";

const players = createPlayers(8);

/** Bots that hit a ring depending on volley and seat. */
const mixed = (volley: number, slot: number) =>
  slot === 2 && volley % 4 === 0
    ? null
    : { afterMs: 1500 + slot * 300, dx: (volley + slot) % 7, dy: slot };

/** What a round looks like to players, so a restored game can be compared with the original. */
const roundShape = (state: TargetRangeState) => ({
  round: state.round,
  target: state.target,
  winds: state.winds,
  scores: state.players.map((player) => [player.points, player.tens]),
});

describe("snapshot", () => {
  it("only changes when a round ends", () => {
    const target = playMatch(5, 3, mixed);
    let last = JSON.stringify(snapshot(init(target.players, 5)));
    const changedIn: string[] = [];
    stepThrough(target.recording(), (step, before) => {
      const current = JSON.stringify(snapshot(step.state));
      if (current !== last) changedIn.push(`${before.phase} to ${step.state.phase}`);
      last = current;
    });
    expect(changedIn).toEqual(Array.from({ length: 4 }, () => "reveal to roundEnd"));
  });

  it("stays under 300 bytes for 8 players", () => {
    const state = init(players, 4_294_967_295);
    const full: TargetRangeState = {
      ...state,
      phase: "roundEnd",
      round: 3,
      rng: 4_294_967_295,
      players: state.players.map((player) => ({ ...player, points: 120, tens: 12 })),
    };
    expect(JSON.stringify(snapshot(full)).length).toBeLessThan(300);
  });

  it("restores at the next round's intro with the same scores, target and winds", () => {
    const target = playMatch(8, 4, mixed);
    const original = stepThrough(
      target.recording(),
      (step) => step.state.phase === "roundEnd" && step.state.round === 2,
    );
    const saved = JSON.parse(JSON.stringify(snapshot(original.state)));
    expect(saved.r).toBe(3);
    const restored = restore(createPlayers(4), 99, saved);

    expect(restored).toMatchObject({ phase: "intro", round: 3, arrow: 1, nowMs: 0, arrows: [] });
    expect(snapshot(restored)).toEqual(saved);
    const continued = stepUntil(original, "intro", 7);
    expect(roundShape(restored)).toEqual(roundShape(continued));
  });

  it("keeps scores with the right player when the seats come back in another order", () => {
    const state = init(players.slice(0, 2), 3);
    const scored = {
      ...state,
      phase: "roundEnd" as const,
      players: state.players.map((player, i) => ({ ...player, points: 10 + i, tens: i })),
    };
    const restored = restore(players.slice(0, 2).toReversed(), 3, snapshot(scored));
    expect(restored.players.map((player) => [player.id, player.points, player.tens])).toEqual([
      [players[1]!.id, 11, 1],
      [players[0]!.id, 10, 0],
    ]);
  });

  it("describes the round in progress until it ends", () => {
    const target = playMatch(3, 2, mixed);
    const recording = target.recording();
    const start = snapshot(
      stepThrough(recording, (step) => step.state.phase === "intro" && step.state.round === 2)
        .state,
    );
    const inRound = stepThrough(
      recording,
      (step) => volleyOf(step.state) === 6 && step.state.phase === "reveal",
    );
    expect(snapshot(inRound.state)).toEqual(start);
    expect(start.r).toBe(2);
  });

  it("starts a new match from a snapshot that doesn't parse", () => {
    expect(restore(players, 9, { r: "two" })).toStrictEqual(init(players, 9));
    expect(restore(players, 9, null)).toStrictEqual(init(players, 9));
  });

  it("gives players missing from the snapshot 0 points", () => {
    const saved = { r: 2, pts: { [players[0]!.id]: 24 }, tens: { [players[0]!.id]: 1 }, rng: 12 };
    const restored = restore(players.slice(0, 2), 9, saved);
    expect(restored.players.map((player) => [player.points, player.tens])).toEqual([
      [24, 1],
      [0, 0],
    ]);
  });

  it("restores a finished match as over, with its placements", () => {
    const target = playMatch(6, 2, (_volley, slot) => ({ afterMs: 1000, dx: slot * 5, dy: 0 }));
    const saved = snapshot(target.state);
    expect(saved.r).toBe(5);
    const restored = restore(target.players, 1, saved);
    expect(restored.phase).toBe("over");
    expect(target.game.outcome(restored)).toEqual(target.outcome());
  });
});
