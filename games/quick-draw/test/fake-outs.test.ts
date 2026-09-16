import { describe, expect, it } from "vitest";
import { createRng } from "@couchcade/utils";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { tickMs } from "@couchcade/game-sdk/contract";
import {
  fakeWordAt,
  fakeWords,
  freeFakeTicks,
  init,
  onPlayerInput,
  rollDrawTicks,
  rollFakeCount,
  rollFakeKind,
  startStandoff,
  view,
} from "../src/shared/index.ts";
import type { Fake, QuickDrawState } from "../src/shared/index.ts";
import type { Player } from "@couchcade/game-sdk/contract";
import { ctxAt, tap, tickUntil } from "./helpers.ts";

const players = createPlayers(4);

/** The standoff of `round`, rolled from a fresh match state for `seed`. */
function standoff(seed: number, round: number, wordsShown = 0): QuickDrawState {
  const state = { ...init(players, seed), round, nowMs: 1500, wordsShown };
  return startStandoff(state, tickMs);
}

function share<T>(samples: readonly T[], value: T): number {
  return samples.filter((sample) => sample === value).length / samples.length;
}

describe("fake-outs", () => {
  it("never happen in round 1", () => {
    for (let seed = 0; seed < 500; seed++) expect(standoff(seed, 1).fakes).toEqual([]);
  });

  it("from round 2: 0, 1 or 2 fakes in 30%, 50% and 20% of standoffs", () => {
    const rng = createRng(2026);
    const counts = Array.from({ length: 20_000 }, () => rollFakeCount(rng, 2));
    expect(share(counts, 0)).toBeCloseTo(0.3, 1);
    expect(share(counts, 1)).toBeCloseTo(0.5, 1);
    expect(share(counts, 2)).toBeCloseTo(0.2, 1);
    expect(rollFakeCount(createRng(1), 1)).toBe(0);
  });

  it("are a word in 50% of fakes, the crow in 25% and the glint in 25%", () => {
    const rng = createRng(7);
    const kinds = Array.from({ length: 20_000 }, () => rollFakeKind(rng));
    expect(share(kinds, "word")).toBeCloseTo(0.5, 1);
    expect(share(kinds, "crow")).toBeCloseTo(0.25, 1);
    expect(share(kinds, "glint")).toBeCloseTo(0.25, 1);
  });

  it("land at least 1,000 ms after the start, before DRAW! and from each other", () => {
    const gaps: number[] = [];
    for (let seed = 0; seed < 2000; seed++) {
      const state = standoff(seed, 2 + (seed % 8));
      const times = [state.phaseAtMs, ...state.fakes.map((fake) => fake.atMs), state.drawDueMs];
      for (let i = 1; i < times.length; i++)
        gaps.push((times[i] as number) - (times[i - 1] as number));
    }
    const fakes = gaps.length - 2000;
    expect(fakes).toBeGreaterThan(1500);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1000 - 1e-6);
  });

  it("never make a standoff longer: DRAW! is rolled before the fakes", () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = standoff(seed, 2);
      const drawTicks = rollDrawTicks(createRng(init(players, seed).rng));
      expect((state.drawDueMs as number) - state.phaseAtMs).toBeCloseTo(drawTicks * tickMs, 6);
    }
  });

  it("are dropped when they don't fit", () => {
    // A 121-tick standoff (2,016 ms) has room for one fake, on tick 60 or 61.
    expect(freeFakeTicks(121, [])).toEqual([60, 61]);
    expect(freeFakeTicks(121, [60])).toEqual([]);
    expect(freeFakeTicks(200, [100])).toEqual([]);
    expect(freeFakeTicks(240, [100])).toEqual(Array.from({ length: 21 }, (_, i) => 160 + i));
  });

  it("have a word only for words and a player only for glints", () => {
    const fakes = Array.from({ length: 500 }, (_, seed) => standoff(seed, 3).fakes).flat();
    expect(fakes.every((fake) => (fake.word !== null) === (fake.kind === "word"))).toBe(true);
    expect(fakes.every((fake) => (fake.playerId !== null) === (fake.kind === "glint"))).toBe(true);
    expect(fakeWords).toEqual(
      expect.arrayContaining(fakes.map((fake) => fake.word).filter(Boolean)),
    );
    const ids = new Set(fakes.map((fake) => fake.playerId).filter((id) => id !== null));
    expect(ids).toEqual(new Set(players.map((player) => player.id)));
  });

  it("only glint on players who are still playing", () => {
    const glinted = new Set<string | null>();
    for (let seed = 0; seed < 500; seed++) {
      const state = init(players, seed);
      const twoLeft = {
        ...state,
        round: 2,
        players: state.players.map((player, slot) => ({ ...player, left: slot > 1 })),
      };
      for (const fake of startStandoff(twoLeft, tickMs).fakes) glinted.add(fake.playerId);
    }
    expect(glinted).toEqual(new Set([null, players[0]?.id, players[1]?.id]));
  });

  it("show every word once before any word repeats", () => {
    for (const wordSeed of [0, 1, 99, 4_294_967_295]) {
      const words = Array.from({ length: 60 }, (_, i) => fakeWordAt(wordSeed, i));
      for (let cycle = 0; cycle < 10; cycle++) {
        expect(words.slice(cycle * 6, cycle * 6 + 6).toSorted()).toEqual(fakeWords.toSorted());
      }
      expect(words.slice(1).filter((word, i) => word === words[i])).toEqual([]);
    }
  });

  it("count the words shown, so the next standoff carries on in the word order", () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = standoff(seed, 2, 4);
      const words = state.fakes.filter((fake) => fake.kind === "word").map((fake) => fake.word);
      expect(state.wordsShown).toBe(4 + words.length);
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("make a tap in reaction to them a foul shown as fooled, without costing points", () => {
    const seed = Array.from({ length: 100 }, (_, i) => i).find(
      (s) => standoff(s, 2).fakes.length > 0,
    );
    const rolled = standoff(seed as number, 2);
    const fake = rolled.fakes[0] as Fake;
    const [alice, bob] = players as [Player, Player];
    const withPoints = { ...rolled, players: rolled.players.map((p) => ({ ...p, points: 1 })) };
    let state = onPlayerInput(withPoints, alice, tap(2), ctxAt(fake.atMs + 300));
    state = onPlayerInput(state, bob, tap(2), ctxAt(fake.atMs - 1));
    expect(state.players.slice(0, 2).map((p) => p.result?.kind)).toEqual(["fooled", "foul"]);
    state = tickUntil(state, "result");
    expect(state.players.map((p) => p.points)).toEqual([1, 1, 1, 1]);
    expect(view(state, alice)).toMatchObject({
      screen: "qd-result",
      data: { result: "fooled" },
      cue: "foul",
    });
  });
});
