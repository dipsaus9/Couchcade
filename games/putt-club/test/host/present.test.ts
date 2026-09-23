import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { present } from "../../src/host/present.ts";
import { course, init } from "../../src/shared/index.ts";
import type { LastStroke, PuttClubState } from "../../src/shared/index.ts";

/**
 * `present()` in isolation (docs/games/putt-club.md, "TV scene", "Callouts"): the callout, the
 * penalty/cap chip and the aim line all key off state the real physics rarely reaches on its own
 * within a short test run (a hole-in-one, a lip-out penalty, a capped hole), so this drives them
 * directly off crafted `PuttClubState` fixtures rather than waiting for the browser boot test's
 * auto-putt-only match to happen to produce one.
 */

function stateWith(overrides: Partial<PuttClubState>): PuttClubState {
  const base = init(createPlayers(2), 1);
  return { ...base, ...overrides };
}

function lastStroke(overrides: Partial<LastStroke>): LastStroke {
  return { result: "rolled", strokes: 1, hole: null, auto: false, ...overrides };
}

describe("present", () => {
  it("shows no callout mid-turn", () => {
    const state = stateWith({ phase: "turn" });
    expect(present(state, { aimYaw: null, holeCount: 9 }).callout).toBeNull();
  });

  it("calls HOLE IN ONE! on a first-stroke hole-out", () => {
    const state = stateWith({
      phase: "result",
      players: init(createPlayers(2), 1).players.map((player, i) =>
        i === 0
          ? { ...player, last: lastStroke({ result: "holed", strokes: 1, hole: 1 }) }
          : player,
      ),
    });
    expect(present(state, { aimYaw: null, holeCount: 9 }).callout).toEqual({
      key: "ace",
      text: "HOLE IN ONE!",
    });
  });

  it("calls BIRDIE! under par and IN! at or over par", () => {
    // Hole 3 (id 3) is a par 3 in the placeholder course (shared/course.ts: every third hole).
    const par3Hole = 3;
    expect(course[par3Hole - 1]?.par).toBe(3);
    const players = init(createPlayers(2), 1).players;

    const birdie = stateWith({
      phase: "result",
      hole: par3Hole,
      players: players.map((player, i) =>
        i === 0
          ? { ...player, last: lastStroke({ result: "holed", strokes: 2, hole: par3Hole }) }
          : player,
      ),
    });
    expect(present(birdie, { aimYaw: null, holeCount: 9 }).callout).toEqual({
      key: "birdie",
      text: "BIRDIE!",
    });

    const onPar = stateWith({
      phase: "result",
      hole: par3Hole,
      players: players.map((player, i) =>
        i === 0
          ? { ...player, last: lastStroke({ result: "holed", strokes: 3, hole: par3Hole }) }
          : player,
      ),
    });
    expect(present(onPar, { aimYaw: null, holeCount: 9 }).callout).toEqual({
      key: "in",
      text: "IN!",
    });
  });

  it("calls MATCH! once the match is over", () => {
    const state = stateWith({ phase: "over", putterId: null });
    expect(present(state, { aimYaw: null, holeCount: 9 }).callout).toEqual({
      key: "match",
      text: "MATCH!",
    });
  });

  it("chips +1 on a penalty and the final count on a cap", () => {
    const players = init(createPlayers(2), 1).players;

    const penalty = stateWith({
      phase: "result",
      players: players.map((player, i) =>
        i === 0 ? { ...player, last: lastStroke({ result: "penalty", strokes: 2 }) } : player,
      ),
    });
    expect(present(penalty, { aimYaw: null, holeCount: 9 }).chip?.text).toBe("+1");

    const capped = stateWith({
      phase: "result",
      players: players.map((player, i) =>
        i === 0
          ? { ...player, last: lastStroke({ result: "capped", strokes: 6, hole: 6 }) }
          : player,
      ),
    });
    expect(present(capped, { aimYaw: null, holeCount: 9 }).chip?.text).toBe("6");
  });

  it("shows the aim line only during turn, and only with a yaw to show", () => {
    const turnState = stateWith({ phase: "turn" });
    expect(present(turnState, { aimYaw: null, holeCount: 9 }).aimLine).toBeNull();
    expect(present(turnState, { aimYaw: 0.2, holeCount: 9 }).aimLine).not.toBeNull();

    const rollingState = stateWith({ phase: "rolling" });
    expect(present(rollingState, { aimYaw: 0.2, holeCount: 9 }).aimLine).toBeNull();
  });

  it("reports the round counter as the hole out of the course's holeCount", () => {
    const state = stateWith({ phase: "turn", hole: 4 });
    expect(present(state, { aimYaw: null, holeCount: 9 }).round).toEqual({ current: 4, total: 9 });
  });
});
