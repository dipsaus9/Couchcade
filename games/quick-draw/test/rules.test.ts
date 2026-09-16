import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { tickMs } from "@couchcade/game-sdk/contract";
import game from "../src/index.ts";
import {
  drawWindowMs,
  init,
  introMs,
  judgeTap,
  maxRounds,
  onPlayerInput,
  onPlayerLeft,
  onTick,
  resultMs,
} from "../src/shared/index.ts";
import type { QuickDrawState } from "../src/shared/index.ts";
import { ctxAt, playMatch, room, stepUntil, tap, tapAt, tickUntil } from "./helpers.ts";

const [alice, bob, cleo] = createPlayers(3) as [
  ReturnType<typeof createPlayers>[number],
  ReturnType<typeof createPlayers>[number],
  ReturnType<typeof createPlayers>[number],
];

/** A round-2 standoff with DRAW! at 5,000 ms and one fake at 3,000 ms. */
function standoffWithFake(): QuickDrawState {
  return {
    ...init([alice, bob, cleo], 1),
    phase: "standoff",
    round: 2,
    nowMs: 2000,
    phaseAtMs: 2000,
    drawDueMs: 5000,
    fakes: [{ atMs: 3000, kind: "word", word: "DRIP!", playerId: null }],
  };
}

/** The same round, at the tick DRAW! is shown. */
function drawAt5000(): QuickDrawState {
  return { ...standoffWithFake(), phase: "draw", nowMs: 5000, phaseAtMs: 5000, drawAtMs: 5000 };
}

const resultOf = (state: QuickDrawState, id: string) =>
  state.players.find((player) => player.id === id)?.result;

describe("init", () => {
  it("starts round 1's intro with every player at 0 points", () => {
    const state = init([alice, bob], 7);
    expect(state).toMatchObject({ phase: "intro", round: 1, nowMs: 0, winners: [], fakes: [] });
    expect(state.players.map((player) => [player.name, player.points])).toEqual([
      ["Player 1", 0],
      ["Player 2", 0],
    ]);
  });
});

describe("round flow", () => {
  it("runs the intro for 1,500 ms, then a standoff of 2 to 8 seconds", () => {
    const target = room(2, 11);
    const standoff = stepUntil(target, "standoff");
    expect(standoff.phaseAtMs).toBeCloseTo(introMs, 6);
    const waitMs = (standoff.drawDueMs as number) - standoff.phaseAtMs;
    expect(waitMs).toBeGreaterThan(2000);
    expect(waitMs).toBeLessThanOrEqual(8000 + 1e-6);
    const draw = stepUntil(target, "draw");
    expect(draw.drawAtMs).toBeCloseTo(standoff.drawDueMs as number, 6);
  });

  it("waits about 3.5 seconds on average and never more than 8", () => {
    const waits = Array.from({ length: 2000 }, (_, seed) => {
      const standoff = tickUntil(init([alice, bob], seed), "standoff");
      return (standoff.drawDueMs as number) - standoff.phaseAtMs;
    });
    const mean = waits.reduce((sum, wait) => sum + wait, 0) / waits.length;
    expect(mean).toBeGreaterThan(3300);
    expect(mean).toBeLessThan(3700);
    expect(Math.max(...waits)).toBeLessThanOrEqual(8000 + 1e-6);
    expect(Math.min(...waits)).toBeGreaterThan(2000);
    // Every wait lands on the 60 Hz tick grid.
    for (const wait of waits) expect(wait / tickMs).toBeCloseTo(Math.round(wait / tickMs), 6);
  });

  it("resolves at DRAW! + 2,000 ms when not everyone tapped", () => {
    const target = room(2, 3);
    const draw = stepUntil(target, "draw");
    const result = stepUntil(target, "result");
    expect(result.phaseAtMs - (draw.drawAtMs as number)).toBeCloseTo(drawWindowMs, 6);
    expect(result.players.map((player) => player.result?.kind)).toEqual(["slow", "slow"]);
  });

  it("resolves as soon as every player has a result", () => {
    const target = room(2, 3);
    const draw = stepUntil(target, "draw");
    tapAt(target, alice.id, (draw.drawAtMs as number) + 200);
    expect(target.state.phase).toBe("draw");
    const state = tapAt(target, bob.id, (draw.drawAtMs as number) + 250);
    expect(state.phase).toBe("result");
    expect(state.phaseAtMs - (draw.drawAtMs as number)).toBeLessThan(250 + 17);
    expect(state.winners).toEqual([alice.id]);
  });

  it("shows the result for 3,000 ms, then starts the next round", () => {
    const target = room(2, 3);
    const result = stepUntil(target, "result");
    const intro = stepUntil(target, "intro", 2);
    expect(intro.phaseAtMs - result.phaseAtMs).toBeCloseTo(resultMs, 6);
  });
});

describe("taps", () => {
  it("is a foul before DRAW!", () => {
    const state = onPlayerInput(standoffWithFake(), alice, tap(2), ctxAt(2500));
    expect(resultOf(state, alice.id)).toEqual({ kind: "foul", ms: null, atMs: 2500 });
  });

  it("is a foul less than 100 ms after DRAW!, and valid from 100 to 1,500 ms", () => {
    const draw = drawAt5000();
    expect(judgeTap(draw, 5099)).toMatchObject({ kind: "foul", ms: null });
    expect(judgeTap(draw, 5099.4)).toMatchObject({ kind: "foul" });
    expect(judgeTap(draw, 5100)).toMatchObject({ kind: "valid", ms: 100 });
    expect(judgeTap(draw, 6500)).toMatchObject({ kind: "valid", ms: 1500 });
    expect(judgeTap(draw, 6501)).toMatchObject({ kind: "slow", ms: 1501 });
  });

  it("marks a foul within 1,000 ms after a fake as fooled", () => {
    const standoff = standoffWithFake();
    expect(judgeTap(standoff, 2999)).toMatchObject({ kind: "foul" });
    expect(judgeTap(standoff, 3000)).toMatchObject({ kind: "fooled" });
    expect(judgeTap(standoff, 3999)).toMatchObject({ kind: "fooled" });
    expect(judgeTap(standoff, 4000)).toMatchObject({ kind: "foul" });
  });

  it("judges only against DRAW!, so a fake never turns a valid tap into a foul", () => {
    const draw = {
      ...drawAt5000(),
      fakes: [{ atMs: 4900, kind: "crow" as const, word: null, playerId: null }],
    };
    expect(judgeTap(draw, 5250)).toMatchObject({ kind: "valid", ms: 250 });
  });

  it("judges when the player tapped, not when the tap arrived", () => {
    const draw = drawAt5000();
    const late = onPlayerInput(draw, alice, tap(2), ctxAt(5240, 5700));
    expect(resultOf(late, alice.id)).toMatchObject({ kind: "valid", ms: 240 });
    const early = onPlayerInput(draw, bob, tap(2), ctxAt(4990, 5300));
    expect(resultOf(early, bob.id)).toMatchObject({ kind: "foul" });
  });

  it("counts only the first tap in a round", () => {
    const first = onPlayerInput(drawAt5000(), alice, tap(2), ctxAt(5050));
    expect(onPlayerInput(first, alice, tap(2), ctxAt(5300))).toBe(first);
  });

  it("ignores taps for another round, outside standoff and draw, and from unknown players", () => {
    const draw = drawAt5000();
    expect(onPlayerInput(draw, alice, tap(1), ctxAt(5300))).toBe(draw);
    const intro = init([alice, bob], 1);
    expect(onPlayerInput(intro, alice, tap(1), ctxAt(10))).toBe(intro);
    const result = { ...draw, phase: "result" as const };
    expect(onPlayerInput(result, alice, tap(2), ctxAt(5300))).toBe(result);
    const [, , , dan] = createPlayers(4);
    expect(onPlayerInput(draw, dan!, tap(2), ctxAt(5300))).toBe(draw);
  });

  it("works in a room: a tap from a slow network still scores on its own time", () => {
    const target = room(2, 5);
    const draw = stepUntil(target, "draw");
    const drawAtMs = draw.drawAtMs as number;
    tapAt(target, bob.id, drawAtMs + 300, drawAtMs + 300);
    tapAt(target, alice.id, drawAtMs + 200, drawAtMs + 650);
    target.step();
    expect(target.state.winners).toEqual([alice.id]);
    expect(resultOf(target.state, alice.id)).toMatchObject({ kind: "valid", ms: 200 });
  });
});

describe("scoring", () => {
  it("gives the fastest valid tap 1 point and nothing to fouls or slow taps", () => {
    let state = onPlayerInput(drawAt5000(), alice, tap(2), ctxAt(5320));
    state = onPlayerInput(state, bob, tap(2), ctxAt(5040));
    state = { ...state, players: state.players.map((p) => ({ ...p, points: 1 })) };
    state = tickUntil(state, "result");
    expect(state.winners).toEqual([alice.id]);
    expect(state.players.map((player) => [player.result?.kind, player.points])).toEqual([
      ["valid", 2],
      ["foul", 1],
      ["slow", 1],
    ]);
  });

  it("gives every player on the same whole millisecond a point", () => {
    let state = onPlayerInput(drawAt5000(), alice, tap(2), ctxAt(5240.2));
    state = onPlayerInput(state, bob, tap(2), ctxAt(5239.8));
    state = onPlayerInput(state, cleo, tap(2), ctxAt(5241));
    state = tickUntil(state, "result");
    expect(state.winners).toEqual([alice.id, bob.id]);
    expect(state.players.map((player) => player.points)).toEqual([1, 1, 0]);
  });

  it("scores nobody when nobody has a valid tap, and never takes points away", () => {
    let state = {
      ...drawAt5000(),
      players: drawAt5000().players.map((p) => ({ ...p, points: 2 })),
    };
    state = onPlayerInput(state, alice, tap(2), ctxAt(5010));
    state = tickUntil(state, "result");
    expect(state.winners).toEqual([]);
    expect(state.players.map((player) => player.points)).toEqual([2, 2, 2]);
  });

  it("keeps each player's fastest valid reaction for the tie-break", () => {
    const target = playMatch(4, 2, (round, slot) => (slot === 0 ? 400 - round * 10 : 500));
    const [first, second] = target.state.players;
    expect(first?.points).toBe(3);
    expect(first?.bestMs).toBe(370);
    expect(second?.bestMs).toBe(500);
  });
});

describe("match end", () => {
  it("ends after the result of the round in which someone reaches 3 points", () => {
    const target = playMatch(9, 3, (_round, slot) => (slot === 1 ? 250 : 400));
    expect(target.over).toBe(true);
    const { state } = target;
    expect(state.phase).toBe("over");
    expect(state.round).toBe(3);
    expect(state.players.map((player) => player.points)).toEqual([0, 3, 0]);
    expect(target.outcome()?.placements).toEqual([
      { playerId: bob.id, place: 1, score: 3 },
      { playerId: alice.id, place: 2, score: 0 },
      { playerId: cleo.id, place: 2, score: 0 },
    ]);
  });

  it("returns no outcome until the final round's result has been shown", () => {
    let state = {
      ...drawAt5000(),
      players: drawAt5000().players.map((p) => ({ ...p, points: 2 })),
    };
    state = onPlayerInput(state, alice, tap(2), ctxAt(5250));
    state = tickUntil(state, "result");
    expect(state.players[0]?.points).toBe(3);
    expect(game.outcome(state)).toBeNull();
    const over = tickUntil(state, "over");
    expect(over.phaseAtMs - state.phaseAtMs).toBeCloseTo(resultMs, 6);
    expect(game.outcome(over)?.placements[0]).toEqual({ playerId: alice.id, place: 1, score: 3 });
  });

  it("stops after round 9 when nobody reaches 3 points", () => {
    const target = playMatch(21, 2, () => null);
    expect(target.state.phase).toBe("over");
    expect(target.state.round).toBe(maxRounds);
    expect(target.outcome()?.placements).toEqual([
      { playerId: alice.id, place: 1, score: 0 },
      { playerId: bob.id, place: 1, score: 0 },
    ]);
  });

  it("stops after round 9 with mixed points, fouls and a tie-break", () => {
    // Alice wins rounds 1 and 2, Bob rounds 3 and 4, then everyone fouls.
    const target = playMatch(33, 3, (round, slot) => {
      if (round <= 2) return slot === 0 ? 210 : 300;
      if (round <= 4) return slot === 1 ? 220 : 300;
      return -500;
    });
    expect(target.state.round).toBe(maxRounds);
    expect(target.outcome()?.placements).toEqual([
      { playerId: alice.id, place: 1, score: 2 },
      { playerId: bob.id, place: 2, score: 2 },
      { playerId: cleo.id, place: 3, score: 0 },
    ]);
  });
});

describe("onPlayerLeft", () => {
  it("keeps the leaver's points, stops them scoring and stops waiting for them", () => {
    let state = {
      ...drawAt5000(),
      players: drawAt5000().players.map((p) => ({ ...p, points: 2 })),
    };
    state = onPlayerLeft(state, cleo);
    expect(state.phase).toBe("draw");
    expect(onPlayerInput(state, cleo, tap(2), ctxAt(5150))).toBe(state);
    state = onPlayerInput(state, alice, tap(2), ctxAt(5300));
    state = onPlayerInput(state, bob, tap(2), ctxAt(5400));
    state = onTick(state, tickMs);
    expect(state.phase).toBe("result");
    expect(state.players.map((player) => [player.points, player.left])).toEqual([
      [3, false],
      [2, false],
      [2, true],
    ]);
  });

  it("does not score a valid tap made before the player left", () => {
    let state = onPlayerInput(drawAt5000(), cleo, tap(2), ctxAt(5120));
    state = onPlayerInput(state, alice, tap(2), ctxAt(5300));
    state = onPlayerLeft(state, cleo);
    state = tickUntil(state, "result");
    expect(state.winners).toEqual([alice.id]);
  });

  it("ends the match at once when fewer than 2 players remain", () => {
    const start = {
      ...drawAt5000(),
      players: drawAt5000().players.map((p, i) => ({ ...p, points: i })),
    };
    const oneLeft = onPlayerLeft(onPlayerLeft(start, alice), cleo);
    expect(oneLeft.phase).toBe("over");
    expect(game.outcome(oneLeft)?.placements).toEqual([
      { playerId: cleo.id, place: 1, score: 2 },
      { playerId: bob.id, place: 2, score: 1 },
      { playerId: alice.id, place: 3, score: 0 },
    ]);
  });

  it("ignores a player who already left, an unknown player and a finished match", () => {
    const left = onPlayerLeft(drawAt5000(), cleo);
    expect(onPlayerLeft(left, cleo)).toBe(left);
    const [, , , dan] = createPlayers(4);
    expect(onPlayerLeft(left, dan!)).toBe(left);
    const over = { ...left, phase: "over" as const };
    expect(onPlayerLeft(over, alice)).toBe(over);
  });

  it("ends a two-player room when one seat expires", () => {
    const target = room(2, 8);
    stepUntil(target, "standoff");
    target.leave(bob.id);
    expect(target.over).toBe(true);
  });
});

describe("onTick", () => {
  it("does nothing once the match is over", () => {
    const over = { ...init([alice, bob], 1), phase: "over" as const };
    expect(onTick(over, tickMs)).toBe(over);
  });

  it("only advances time from dtMs", () => {
    const state = onTick(onTick(init([alice, bob], 1), tickMs), tickMs);
    expect(state.nowMs).toBeCloseTo(2 * tickMs, 9);
  });
});
