import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { tickMs } from "@couchcade/game-sdk/contract";
import { init, maxRounds, onTick, restore, snapshot, startStandoff } from "../src/shared/index.ts";
import type { QuickDrawState } from "../src/shared/index.ts";
import { playMatch, stepThrough, stepUntil, tickUntil } from "./helpers.ts";

const players = createPlayers(8);

/** Standoff timing and fakes relative to the standoff start, so two games compare. */
function standoffShape(state: QuickDrawState) {
  return {
    round: state.round,
    waitMs: Math.round((state.drawDueMs as number) - state.phaseAtMs),
    fakes: state.fakes.map((fake) => ({ ...fake, atMs: Math.round(fake.atMs - state.phaseAtMs) })),
  };
}

describe("snapshot", () => {
  it("only changes when a round resolves", () => {
    const target = playMatch(5, 3, (round, slot) => (slot === round % 3 ? 230 : 300 + slot));
    let last = JSON.stringify(snapshot(init(target.players, 5)));
    const changedIn: string[] = [];
    let resolves = 0;
    stepThrough(target.recording(), (step, before) => {
      if (before.phase === "draw" && step.state.phase === "result") resolves += 1;
      const current = JSON.stringify(snapshot(step.state));
      if (current !== last) changedIn.push(`${before.phase} to ${step.state.phase}`);
      last = current;
    });
    expect(resolves).toBeGreaterThan(2);
    expect(changedIn).toEqual(Array.from({ length: resolves }, () => "draw to result"));
  });

  it("stays under 300 bytes for 8 players", () => {
    const state = init(players, 4_294_967_295);
    const full = {
      ...state,
      round: maxRounds,
      phase: "result" as const,
      rng: 4_294_967_295,
      wordsShown: 18,
      players: state.players.map((player) => ({ ...player, points: 3, bestMs: 1500 })),
    };
    expect(JSON.stringify(snapshot(full)).length).toBeLessThan(300);
  });

  it("restores at the next round's intro with the same points and the same next standoff", () => {
    const target = playMatch(8, 4, (round, slot) => (slot === round % 2 ? 210 + round : 400));
    expect(target.state.round).toBeGreaterThan(2);

    const original = stepThrough(
      target.recording(),
      (step) => step.state.phase === "result" && step.state.round === 2,
    );
    const saved = JSON.parse(JSON.stringify(snapshot(original.state)));
    const restored = restore(createPlayers(4), 8, saved);

    expect(restored).toMatchObject({ phase: "intro", round: 3, nowMs: 0 });
    expect(restored.players.map((p) => [p.points, p.bestMs])).toEqual(
      original.state.players.map((p) => [p.points, p.bestMs]),
    );
    expect(snapshot(restored)).toEqual(saved);

    const continued = stepUntil(original, "standoff", 3);
    expect(standoffShape(tickUntil(restored, "standoff"))).toEqual(standoffShape(continued));
  });

  it("keeps the word order across a restore", () => {
    const state = { ...init(players, 77), round: 2, wordsShown: 5 };
    const rolled = startStandoff(state, tickMs);
    const restored = restore(players, 77, snapshot(state));
    expect(standoffShape(startStandoff(restored, tickMs))).toEqual(standoffShape(rolled));
  });

  it("describes the round in progress during its standoff and draw", () => {
    const state = tickUntil(init(players, 3), "standoff");
    expect(snapshot(state)).toEqual(snapshot(init(players, 3)));
    expect(snapshot(onTick(tickUntil(state, "draw"), tickMs))).toEqual(snapshot(init(players, 3)));
  });

  it("starts a new match from a snapshot that doesn't parse", () => {
    expect(restore(players, 9, { round: "two" })).toStrictEqual(init(players, 9));
    expect(restore(players, 9, null)).toStrictEqual(init(players, 9));
  });

  it("gives players missing from the snapshot 0 points", () => {
    const saved = { round: 4, rng: 12, words: 1, players: { [players[0]!.id]: [2, 310] } };
    const restored = restore(players.slice(0, 2), 9, saved);
    expect(restored.players.map((p) => [p.points, p.bestMs])).toEqual([
      [2, 310],
      [0, null],
    ]);
  });

  it("restores a decided match as over", () => {
    const won = { round: 3, rng: 1, words: 0, players: { [players[0]!.id]: [3, 200] } };
    expect(restore(players.slice(0, 2), 1, won).phase).toBe("over");
    const last = { round: 10, rng: 1, words: 0, players: {} };
    expect(restore(players.slice(0, 2), 1, last)).toMatchObject({ phase: "over", round: 9 });
  });
});
