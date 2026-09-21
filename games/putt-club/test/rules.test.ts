import { describe, expect, it } from "vitest";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { compare, outcome } from "../src/shared/outcome.ts";
import { restore, snapshot } from "../src/shared/snapshot.ts";
import { onPlayerInput, onPlayerLeft, onTick } from "../src/shared/rules.ts";
import { course } from "../src/shared/course.ts";
import { findPlayer, init } from "../src/shared/state.ts";
import type { PuttClubState } from "../src/shared/state.ts";
import { view } from "../src/shared/view.ts";

const ctxAt = (nowMs: number): InputContext => ({ atMs: nowMs, nowMs, displayLagMs: 0 });

function tickUntil(
  state: PuttClubState,
  predicate: (state: PuttClubState) => boolean,
  maxTicks = 60 * 60 * 30,
): PuttClubState {
  let next = state;
  for (let i = 0; i < maxTicks && !predicate(next); i++) next = onTick(next, tickMs);
  return next;
}

/** Putts straight at the cup (`yaw = 0`, `angle = 0`): only `speed` decides where it stops. */
function puttStraight(state: PuttClubState, player: Player, speed: number): PuttClubState {
  return onPlayerInput(
    state,
    player,
    { type: "putt", payload: { turn: state.turn, yaw: 0, speed, angle: 0 } },
    ctxAt(state.nowMs),
  );
}

/**
 * `speed` that reaches `distance` metres away still carrying `leftover` m/s (ROLL_DECEL 1.5 m/s^2):
 * aimed straight at the cup (`puttStraight`), a small `leftover` under CAPTURE_SPEED holes it out.
 */
function speedFor(distance: number, leftover = 0.5): number {
  const v = Math.sqrt(2 * 1.5 * distance + leftover * leftover);
  return Math.max(0, Math.min(1, (v - 0.6) / 4.4));
}

function toTurn(state: PuttClubState): PuttClubState {
  return tickUntil(state, (s) => s.phase === "turn");
}

function toResult(state: PuttClubState): PuttClubState {
  return tickUntil(state, (s) => s.phase === "result" || s.phase === "over");
}

describe("init", () => {
  it("starts the match at the clubhouse gate, hole 1, seat 0's honour", () => {
    const [alice, bob] = createPlayers(2);
    const state = init([alice as Player, bob as Player], 1);
    expect(state.phase).toBe("intro");
    expect(state.hole).toBe(1);
    expect(state.turn).toBe(1);
    expect(state.putterId).toBe(alice!.id);
    expect(state.players.every((p) => p.total === 0 && p.strokes === 0)).toBe(true);
  });
});

describe("a straight ace holes out in one", () => {
  it("scores 1 for a putt that stops inside the cup", () => {
    const [alice, bob] = createPlayers(2) as [Player, Player];
    let state = init([alice, bob], 1);
    state = toTurn(state);
    expect(state.putterId).toBe(alice.id);

    const hole1 = course[0]!;
    const distance = hole1.cup[0] - hole1.tee[0];
    state = puttStraight(state, alice, speedFor(distance));
    expect(state.phase).toBe("rolling");

    state = toResult(state);
    const player = findPlayer(state, alice.id)!;
    expect(player.last?.result).toBe("holed");
    expect(player.last?.hole).toBe(1);
    expect(player.doneHole).toBe(true);
    expect(player.scores[0]).toBe(1);
  });
});

describe("turns rotate in seat order and skip finished players", () => {
  it("moves to the next seated player after each result", () => {
    const [alice, bob, carol] = createPlayers(3) as [Player, Player, Player];
    let state = init([alice, bob, carol], 1);
    state = toTurn(state);
    expect(state.putterId).toBe(alice.id);

    // A deliberately short putt: it just rolls, doesn't hole, doesn't leave the hole in progress.
    state = puttStraight(state, alice, 0.05);
    state = toResult(state);
    expect(findPlayer(state, alice.id)?.last?.result).toBe("rolled");

    state = toTurn(state);
    expect(state.putterId).toBe(bob.id);
  });

  it("hole 2's honour passes to the next seat (rule 3)", () => {
    const [alice, bob] = createPlayers(2) as [Player, Player];
    let state = init([alice, bob], 1);
    state = toTurn(state);
    const hole1 = course[0]!;
    const ace = speedFor(hole1.cup[0] - hole1.tee[0]);

    // Both players ace hole 1, then hole 2 should open with bob's honour (rule 3: hole h starts
    // with seat (h - 1) mod playerCount).
    state = puttStraight(state, alice, ace);
    state = toResult(state);
    state = toTurn(state);
    expect(state.putterId).toBe(bob.id);
    state = puttStraight(state, bob, ace);
    state = toResult(state);

    state = tickUntil(state, (s) => s.hole === 2 && s.phase === "turn");
    expect(state.putterId).toBe(bob.id);
  });
});

describe("the 6-stroke cap (rule 9)", () => {
  it("picks a player up at 6 strokes without holing out and scores them 6", () => {
    // Alone, so every turn comes straight back to her (rule 3's rotation only skips other seats).
    const [alice] = createPlayers(1) as [Player];
    let state = init([alice], 1);
    state = toTurn(state);

    // A putt far too soft to ever reach the cup: it always just rolls a few centimetres.
    for (let stroke = 1; stroke <= 5; stroke++) {
      expect(state.putterId).toBe(alice.id);
      state = puttStraight(state, alice, 0.01);
      state = toResult(state);
      const player = findPlayer(state, alice.id)!;
      expect(player.last?.result).toBe("rolled");
      expect(player.doneHole).toBe(false);
      state = toTurn(state);
    }

    // The 6th stroke, still without holing out: picked up and scored 6.
    expect(state.putterId).toBe(alice.id);
    state = puttStraight(state, alice, 0.01);
    state = toResult(state);
    const player = findPlayer(state, alice.id)!;
    expect(player.last?.result).toBe("capped");
    expect(player.last?.hole).toBe(6);
    expect(player.scores[0]).toBe(6);
    expect(player.doneHole).toBe(true);
  });
});

describe("away players get a shorter timer (rule 6)", () => {
  it("shortens the turn timer after 2 auto-putts and the next accepted input clears it", () => {
    const [alice] = createPlayers(1) as [Player];
    let state = init([alice], 1);
    state = toTurn(state);
    expect(state.awayAtTurnStart).toBe(false);

    // Let the turn timer lapse twice: the auto-putt fires and always aims at the cup.
    for (let i = 0; i < 2; i++) {
      state = toResult(state);
      expect(findPlayer(state, alice.id)?.last?.auto).toBe(true);
      state = toTurn(state);
    }
    expect(state.awayAtTurnStart).toBe(true);
    expect(state.deadlineMs).toBe(state.phaseAtMs + 5000);

    // An accepted aim input clears away: the deadline moves to 10,000 ms after it.
    const before = state.deadlineMs as number;
    state = onPlayerInput(
      state,
      alice,
      { type: "aim", payload: { yaw: 0, pitch: 0 } },
      ctxAt(state.nowMs),
    );
    expect(state.deadlineMs).toBeGreaterThan(before);
  });
});

describe("hazards and out-of-bounds penalties count and reset (rule 8)", () => {
  // The placeholder course's own walls sit exactly on `bounds` (it's a plain rectangle, not one of
  // CC-13.8's real holes), so a shot can't actually leave play on it — every hole a ball could
  // leave through is walled. `physics.test.ts` proves the segment tests and `resetSpot`'s
  // walk-back against holes built to have a hazard and an open edge; this test proves the *rules*
  // wire an "offPlay" stroke outcome into a penalty stroke and a reset, by driving a stroke
  // directly to that outcome (a legitimate way to exercise a pure state transition).
  it("a stroke that leaves play costs a penalty stroke, resets the ball, and doesn't finish the hole", () => {
    const [alice] = createPlayers(1) as [Player];
    let state = init([alice], 1);
    state = toTurn(state);
    const hole1 = course[0]!;

    state = puttStraight(state, alice, 0.3);
    expect(state.phase).toBe("rolling");
    const stroke = state.activeStroke!;
    state = {
      ...state,
      activeStroke: {
        ...stroke,
        path: [hole1.tee, [hole1.tee[0] + 0.5, hole1.tee[1]]],
        outcome: "offPlay",
      },
    };
    state = onTick(state, tickMs);
    expect(state.phase).toBe("result");

    const player = findPlayer(state, alice.id)!;
    expect(player.last?.result).toBe("penalty");
    expect(player.strokes).toBe(2); // the stroke, plus one penalty stroke
    expect(player.doneHole).toBe(false);
    expect(player.ball[0]).toBeGreaterThanOrEqual(hole1.bounds[0][0]);
    expect(player.ball[0]).toBeLessThanOrEqual(hole1.bounds[1][0]);
  });
});

describe("view", () => {
  it("gives the putter pc-putt and everyone else pc-watch or pc-next", () => {
    const [alice, bob] = createPlayers(2) as [Player, Player];
    let state = init([alice, bob], 1);
    state = toTurn(state);
    expect(view(state, alice).screen).toBe("pc-putt");
    expect(view(state, bob).screen).toBe("pc-next");
    expect(view(state, alice).data.hole).toBe(1);
    expect(view(state, alice).data.cap).toBe(6);
  });
});

describe("outcome and placements (rule 13)", () => {
  it("is null while the match runs and sorts by total strokes once it's over", () => {
    const [alice, bob] = createPlayers(2) as [Player, Player];
    const state = init([alice, bob], 1);
    expect(outcome(state)).toBeNull();
  });

  it("compares fewer strokes ahead of more", () => {
    const [alice, bob] = createPlayers(2) as [Player, Player];
    const state = init([alice, bob], 1);
    const leader = { ...state.players[0]!, total: 10 };
    const trailer = { ...state.players[1]!, total: 12 };
    expect(compare(leader, trailer)).toBeLessThan(0);
    expect(compare(trailer, leader)).toBeGreaterThan(0);
  });
});

describe("snapshot and restore", () => {
  it("restores a mid-match snapshot with every ball back on the resumed hole's tee", () => {
    const [alice, bob] = createPlayers(2) as [Player, Player];
    let state = init([alice, bob], 1);
    state = toTurn(state);
    const hole1 = course[0]!;
    const ace = speedFor(hole1.cup[0] - hole1.tee[0]);
    state = puttStraight(state, alice, ace);
    state = toResult(state);
    state = toTurn(state);
    state = puttStraight(state, bob, ace);
    state = toResult(state);
    state = tickUntil(state, (s) => s.hole === 2);

    const saved = snapshot(state);
    const restored = restore([alice, bob], 1, saved);
    expect(restored.hole).toBe(2);
    expect(restored.phase).toBe("turn");
    expect(restored.players.map((p) => p.total)).toEqual(state.players.map((p) => p.total));
    expect(restored.players.every((p) => p.ball[0] === course[1]!.tee[0])).toBe(true);
  });

  it("starts a fresh match from data that doesn't parse", () => {
    const [alice, bob] = createPlayers(2) as [Player, Player];
    const restored = restore([alice, bob], 1, null);
    expect(restored).toStrictEqual(init([alice, bob], 1));
  });
});

describe("onPlayerLeft (rule 14)", () => {
  it("keeps the strokes played so far on the hole in progress and caps the holes never reached", () => {
    const [alice, bob] = createPlayers(2) as [Player, Player];
    let state = init([alice, bob], 1);
    state = toTurn(state);
    state = puttStraight(state, alice, 0.05); // a rolled, unfinished stroke
    state = toResult(state);
    const strokesSoFar = findPlayer(state, alice.id)!.strokes;
    expect(strokesSoFar).toBeGreaterThan(0);

    state = onPlayerLeft(state, alice);
    const left = findPlayer(state, alice.id)!;
    expect(left.left).toBe(true);
    expect(left.doneHole).toBe(true);
    expect(left.scores[0]).toBe(strokesSoFar);
    expect(left.scores.slice(1).every((score) => score === 6)).toBe(true);
  });

  it("ends the match once nobody is left seated", () => {
    const [alice] = createPlayers(1) as [Player];
    const state = init([alice], 1);
    const left = onPlayerLeft(state, alice);
    expect(left.phase).toBe("over");
  });
});
