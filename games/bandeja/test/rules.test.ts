import { describe, expect, it } from "vitest";
import {
  init,
  isAutoSlot,
  matchMaxMs,
  onPlayerInput,
  onPlayerLeft,
  outcome,
} from "../src/shared/index.ts";
import type { BandejaState } from "../src/shared/index.ts";
import {
  arriveAtFor,
  ctxAt,
  players2,
  players3,
  players4,
  ralliedState,
  swingInput,
  tickUntil,
} from "./helpers.ts";

/**
 * Scoring and win-condition unit tests (docs/games/bandeja.md, acceptance criterion 3). Most drop
 * a ball directly into flight with `ralliedState` rather than choreographing a full serve: the
 * serve itself, the physics worked numbers and the look-ahead are covered in `physics.test.ts`,
 * and a full recorded match is covered in `replay.test.ts`.
 */
describe("rules and scoring", () => {
  it("a shot that dies below net height ends the point for the other side (rule 6)", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    const state = ralliedState(base, { x: 5, y: 9.9, z: 0.3, vx: 0, vy: 14, vz: 0 });
    const result = tickUntil(state, (s) => s.phase === "pointEnd", 30);
    expect(result.lastPoint).toEqual({ won: "b", reason: "net" });
    expect(result.scores).toEqual({ a: 0, b: 1 });
  });

  it("two floor bounces on one side without a hit end the point (rule 6, Fairness rule 3)", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    // Resting on side B's court: it just bounces in place until the second bounce starts the
    // 250 ms settle timer, and then again until nobody saves it.
    const state = ralliedState(base, { x: 5.0, y: 14.0, z: 0.05, vx: 0, vy: 0, vz: 0 });
    const result = tickUntil(state, (s) => s.phase === "pointEnd", 300);
    expect(result.lastPoint).toEqual({ won: "a", reason: "double-bounce" });
    expect(result.scores).toEqual({ a: 1, b: 0 });
  });

  it("a swing before the settle timer saves a double bounce (Fairness rule 3)", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    const state = ralliedState(base, { x: 5.0, y: 14.0, z: 0.05, vx: 0, vy: 0, vz: 0 });
    const settling = tickUntil(state, (s) => s.rally?.pointSettleAtMs != null, 200);
    expect(settling.phase).toBe("rally");
    const arriveAt = arriveAtFor(settling, "b-solo");
    const saved = onPlayerInput(settling, bob, swingInput(settling.point, 0.5, 0), ctxAt(arriveAt));
    expect(saved.phase).toBe("rally");
    expect(saved.lastPoint).toBeNull();
    expect(saved.rally?.pointSettleAtMs).toBeNull();
    expect(saved.rally?.shots).toBe((settling.rally?.shots ?? 0) + 1);
  });

  it("a side reaching the target wins the match outright, placed 1 and 2 in singles (rule 7, 12)", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    const almostWon: BandejaState = { ...base, scores: { a: 6, b: 0 } };
    // A shot dying at the net on side B's court hands side A the 7th point.
    const state = ralliedState(almostWon, { x: 5, y: 10.05, z: 0.3, vx: 0, vy: -2, vz: 0 });
    const ended = tickUntil(state, (s) => s.phase === "over", 700);
    expect(ended.scores).toEqual({ a: 7, b: 0 });
    expect(outcome(ended)?.placements).toEqual(
      expect.arrayContaining([
        { playerId: alice.id, place: 1, score: 7 },
        { playerId: bob.id, place: 2, score: 0 },
      ]),
    );
  });

  it("the match ends for the leader once the clock passes its cap (rule 8)", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    const state: BandejaState = {
      ...base,
      phase: "pointEnd",
      nowMs: matchMaxMs,
      phaseAtMs: matchMaxMs,
      scores: { a: 4, b: 3 },
      lastPoint: { won: "a", reason: "net" },
    };
    const ended = tickUntil(state, (s) => s.phase === "over", 400);
    expect(ended.scores).toEqual({ a: 4, b: 3 });
  });

  it("a level match at the clock cap plays on to the next point (rule 8)", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    const state: BandejaState = {
      ...base,
      phase: "pointEnd",
      nowMs: matchMaxMs,
      phaseAtMs: matchMaxMs,
      scores: { a: 3, b: 3 },
      lastPoint: { won: "a", reason: "net" },
    };
    const next = tickUntil(state, (s) => s.phase !== "pointEnd", 400);
    expect(next.phase).toBe("serve");
  });

  it("a 3-player match seats a-left, b-left, a-right and leaves b-right empty (rule 2)", () => {
    const [alice, bob, carol] = players3();
    const state = init([alice, bob, carol], 1);
    expect(state.players.map((player) => player.slot)).toEqual(["a-left", "b-left", "a-right"]);
    expect(isAutoSlot(state, "b-right")).toBe(true);
  });

  it(
    "an empty slot auto-hits every ball it can reach, aiming centre when the receiving side's " +
      "coverage is even (rule 10, CC-23.8's real CPU)",
    () => {
      const [alice, bob, carol] = players3();
      const base = init([alice, bob, carol], 1);
      // a-right's home is (7.4, 6.4); a clean drive with aim 0 travels straight down x = 7.4,
      // exactly through b-right's (empty, auto) reach at (7.4, 13.6). Side A is a-left and a-right,
      // both real players, symmetric about the centre line, so ai/cpu.ts's weakerSideSign has no
      // gap to aim at and returns 0 - the same shape rule 10's old stand-in always produced, now for
      // a real reason instead of a fixed constant. games/bandeja/test/ai/cpu.test.ts covers the
      // asymmetric case where it does pick a side.
      const state = ralliedState(base, { x: 7.4, y: 6.4, z: 0.8, vx: 0, vy: 14, vz: 3.2 });
      const hit = tickUntil(state, (s) => (s.rally?.shots ?? 0) >= 2, 200);
      expect(hit.phase).toBe("rally");
      expect(hit.ball).not.toBeNull();
      expect(Math.abs(hit.ball?.body.vx ?? 1)).toBeLessThan(0.01);
    },
  );

  it("any accepted swing clears an away slot at once (rule 10)", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    const away: BandejaState = {
      ...base,
      players: base.players.map((player) =>
        player.id === alice.id ? { ...player, missStreak: 3 } : player,
      ),
    };
    expect(isAutoSlot(away, "a-solo")).toBe(true);

    const state = ralliedState(away, { x: 5.0, y: 6.0, z: 0.8, vx: 0, vy: -1, vz: 0.5 });
    const arriveAt = arriveAtFor(state, "a-solo");
    const swung = onPlayerInput(state, alice, swingInput(state.point, 0.6, 0), ctxAt(arriveAt));
    const alicePlayer = swung.players.find((player) => player.id === alice.id);
    expect(alicePlayer?.missStreak).toBe(0);
    expect(isAutoSlot(swung, "a-solo")).toBe(false);
  });

  it("an unswung arrival records a miss once its window fully passes (rule 10)", () => {
    const [alice, bob] = players2();
    const base = init([alice, bob], 1);
    const state = ralliedState(base, { x: 5.0, y: 6.0, z: 0.8, vx: 0, vy: -1, vz: 0.5 });
    const after = tickUntil(
      state,
      (s) => (s.players.find((player) => player.id === alice.id)?.missStreak ?? 0) > 0,
      300,
    );
    expect(after.players.find((player) => player.id === alice.id)?.missStreak).toBe(1);
  });

  it("a seat that expires auto-returns for the rest of the match, keeping its points (rule 13)", () => {
    const [alice, bob, carol, dave] = players4();
    const state: BandejaState = { ...init([alice, bob, carol, dave], 1), scores: { a: 5, b: 2 } };
    expect(isAutoSlot(state, "a-left")).toBe(false);
    const left = onPlayerLeft(state, alice);
    expect(isAutoSlot(left, "a-left")).toBe(true);
    expect(left.phase).not.toBe("over"); // carol (a-right) keeps side A in the match
    expect(left.scores).toEqual({ a: 5, b: 2 }); // points are kept, not reset
  });

  it("if a whole side empties the match ends at once with placements (rule 13)", () => {
    const [alice, bob] = players2();
    const state: BandejaState = { ...init([alice, bob], 1), scores: { a: 3, b: 5 } };
    const left = onPlayerLeft(state, alice);
    expect(left.phase).toBe("over");
    expect(outcome(left)?.placements).toEqual(
      expect.arrayContaining([
        { playerId: alice.id, place: 2, score: 3 },
        { playerId: bob.id, place: 1, score: 5 },
      ]),
    );
  });
});

describe("outcome (rule 12)", () => {
  it("places both winners at 1 and both losers at 3 in doubles", () => {
    const [alice, bob, carol, dave] = players4();
    const base = init([alice, bob, carol, dave], 1); // a-left, b-left, a-right, b-right
    const over: BandejaState = { ...base, phase: "over", scores: { a: 7, b: 3 } };
    expect(outcome(over)?.placements).toEqual(
      expect.arrayContaining([
        { playerId: alice.id, place: 1, score: 7 },
        { playerId: carol.id, place: 1, score: 7 },
        { playerId: bob.id, place: 3, score: 3 },
        { playerId: dave.id, place: 3, score: 3 },
      ]),
    );
  });

  it("is null while the match runs", () => {
    const [alice, bob] = players2();
    expect(outcome(init([alice, bob], 1))).toBeNull();
  });
});
