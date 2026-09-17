import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { tickMs, tickTimeMs } from "@couchcade/game-sdk/contract";
import game from "../src/index.ts";
import {
  init,
  introMs,
  maxMatchPoints,
  onPlayerInput,
  onPlayerLeft,
  onTick,
  outcome,
  revealMs,
  roundEndMs,
  volleyMs,
  volleyOf,
} from "../src/shared/index.ts";
import type { TargetRangePlayer, TargetRangeState } from "../src/shared/index.ts";
import {
  aim,
  aimFor,
  ctxAt,
  lower,
  playMatch,
  room,
  shoot,
  stepUntil,
  tickUntil,
} from "./helpers.ts";

const [alice, bob, cleo] = createPlayers(3) as [
  ReturnType<typeof createPlayers>[number],
  ReturnType<typeof createPlayers>[number],
  ReturnType<typeof createPlayers>[number],
];

/** Round 3, arrow 2 (volley 8), open since 20,000 ms, target (200, 130), wind 3 to the right. */
function openVolley(): TargetRangeState {
  const base = init([alice, bob, cleo], 1);
  return {
    ...base,
    phase: "open",
    round: 3,
    arrow: 2,
    nowMs: 21_000,
    phaseAtMs: 20_000,
    openAtMs: 20_000,
    target: { x: 200, y: 130 },
    winds: [1, 3, -2],
  };
}

/** The same volley after it timed out at 30,000 ms. */
function timedOutVolley(): TargetRangeState {
  return {
    ...openVolley(),
    phase: "landing",
    nowMs: 30_100,
    phaseAtMs: 30_000,
    closeAtMs: 30_000,
    timedOut: true,
  };
}

const playerOf = (state: TargetRangeState, id: string) =>
  state.players.find((player) => player.id === id) as TargetRangePlayer;

const bullseye = (state: TargetRangeState) => {
  const { yaw, pitch } = aimFor(state, state.target.x, state.target.y);
  return shoot(volleyOf(state), yaw, pitch);
};

describe("init", () => {
  it("starts round 1's intro at 0 with every player on 0 points and a calm wind", () => {
    const state = init([alice, bob], 7);
    expect(state).toMatchObject({ phase: "intro", round: 1, arrow: 1, nowMs: 0, arrows: [] });
    expect(state.winds).toEqual([0, 0, 0]);
    expect(state.players.map((player) => [player.name, player.points, player.tens])).toEqual([
      ["Player 1", 0, 0],
      ["Player 2", 0, 0],
    ]);
  });

  it("accepts a single player", () => {
    expect(game.players).toEqual({ min: 1, max: 8 });
    const target = playMatch(3, 1, () => ({ afterMs: 1000, dx: 0, dy: 0 }));
    expect(target.outcome()?.placements).toEqual([
      { playerId: alice.id, place: 1, score: maxMatchPoints },
    ]);
  });
});

describe("round flow", () => {
  it("runs the intro for 2,500 ms, then opens volley 1", () => {
    const target = room(2, 11);
    const open = stepUntil(target, "open");
    expect(open.openAtMs).toBeCloseTo(introMs, 6);
    expect(volleyOf(open)).toBe(1);
  });

  it("closes a volley after 10,000 ms, waits 500 ms for late shots, then reveals for 1,500 ms", () => {
    const target = room(2, 11);
    const open = stepUntil(target, "open");
    const landing = stepUntil(target, "landing");
    expect(landing.closeAtMs).toBe((open.openAtMs as number) + volleyMs);
    expect(landing.timedOut).toBe(true);
    const reveal = stepUntil(target, "reveal");
    expect(reveal.phaseAtMs - (landing.closeAtMs as number)).toBeCloseTo(500, 6);
    expect(reveal.players.map((player) => player.last)).toEqual(["none", "none"]);
    const next = stepUntil(target, "open", 2);
    expect(next.openAtMs! - reveal.phaseAtMs).toBeCloseTo(revealMs, 6);
  });

  it("closes as soon as everyone shot and reveals once every arrow landed", () => {
    const target = room(2, 5);
    const open = stepUntil(target, "open");
    const openAt = open.openAtMs as number;
    target.input(alice.id, bullseye(open), openAt + 1000);
    target.step();
    expect(target.state.phase).toBe("open");
    target.input(bob.id, shoot(1, 0.5, 0.5, 0.3), target.nowMs);
    const landing = target.step();
    expect(landing.phase).toBe("landing");
    expect(landing.timedOut).toBe(false);
    expect(landing.closeAtMs).toBe(landing.nowMs);
    const slowest = landing.arrows.find((arrow) => arrow.playerId === bob.id)!;
    expect(slowest.flightMs).toBe(603);
    const reveal = stepUntil(target, "reveal");
    expect(reveal.phaseAtMs).toBeGreaterThanOrEqual(slowest.landsAtMs - tickMs / 2);
    expect(reveal.phaseAtMs).toBeLessThan(slowest.landsAtMs + tickMs);
    expect(reveal.arrows.every((arrow) => arrow.landed)).toBe(true);
  });

  it("plays 3 volleys a round, shows the round end for 3,000 ms and starts the next round", () => {
    const target = room(1, 9);
    const roundEnd = stepUntil(target, "roundEnd");
    expect(volleyOf(roundEnd)).toBe(3);
    const intro = stepUntil(target, "intro");
    expect(intro).toMatchObject({ round: 2, arrow: 1, arrows: [] });
    expect(intro.phaseAtMs - roundEnd.phaseAtMs).toBeCloseTo(roundEndMs, 6);
  });

  it("keeps the target for the round and rolls a wind per arrow", () => {
    const target = room(2, 21);
    const intro = stepUntil(target, "intro");
    const middle = stepUntil(target, "open", 4);
    expect(middle.round).toBe(2);
    const later = stepUntil(target, "open", 6);
    expect(later.target).toEqual(middle.target);
    expect(later.winds).toEqual(middle.winds);
    expect(intro.target).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    for (const wind of middle.winds) expect(Math.abs(wind)).toBeLessThanOrEqual(2);
  });

  it("only advances time from dtMs and stops once the match is over", () => {
    const state = onTick(onTick(init([alice, bob], 1), tickMs), tickMs);
    expect(state.nowMs).toBeCloseTo(2 * tickMs, 9);
    const over = { ...state, phase: "over" as const };
    expect(onTick(over, tickMs)).toBe(over);
  });
});

describe("shooting", () => {
  it("flies the arrow from the aim at release with the volley's wind, not from the crosshair", () => {
    let state = onPlayerInput(
      openVolley(),
      alice,
      aim([-200, 0.9, 0.9], [0, 0.8, 0.8]),
      ctxAt(21_000),
    );
    state = onPlayerInput(state, alice, shoot(8, -0.2, 0.1, 1), ctxAt(21_500, 21_700));
    const [arrow] = state.arrows;
    expect(arrow).toMatchObject({
      playerId: alice.id,
      volley: 8,
      atMs: 21_500,
      x: 200 + 3 * 4,
      y: 131 + 14,
      flightMs: 650,
      landsAtMs: 22_150,
      landed: false,
    });
    expect(playerOf(state, alice.id)).toMatchObject({
      result: arrow!.points,
      aiming: false,
      aim: [],
    });
  });

  it("judges the shot when the player let go, not when it arrived", () => {
    const shot = shoot(8, -0.2, 0.1);
    const inTime = onPlayerInput(timedOutVolley(), alice, shot, ctxAt(29_990, 30_300));
    expect(inTime.arrows).toHaveLength(1);
    expect(playerOf(inTime, alice.id).result).toBeTypeOf("number");
    const atClose = onPlayerInput(timedOutVolley(), alice, shot, ctxAt(30_000, 30_300));
    expect(atClose.arrows).toHaveLength(1);
    const late = onPlayerInput(timedOutVolley(), alice, shot, ctxAt(30_001, 30_300));
    expect(late.arrows).toEqual([]);
    expect(playerOf(late, alice.id)).toMatchObject({ result: "late", aiming: false });
  });

  it("scores a late shot 0 and shows it as late at the reveal", () => {
    let state = onPlayerInput(timedOutVolley(), alice, shoot(8), ctxAt(30_200));
    state = tickUntil(state, "reveal");
    expect(playerOf(state, alice.id)).toMatchObject({ last: "late", points: 0 });
    expect(playerOf(state, bob.id)).toMatchObject({ last: "none", points: 0 });
  });

  it("counts only the first shot of a volley", () => {
    const first = onPlayerInput(openVolley(), alice, shoot(8), ctxAt(21_000));
    expect(onPlayerInput(first, alice, shoot(8, 0.3), ctxAt(21_000))).toBe(first);
    expect(onPlayerInput(first, alice, aim([0, 0.1, 0.1]), ctxAt(21_000))).toBe(first);
  });

  it("ignores a shot for another volley, before the volley opened, or outside open and landing", () => {
    const open = openVolley();
    expect(onPlayerInput(open, alice, shoot(7), ctxAt(21_000))).toBe(open);
    expect(onPlayerInput(open, alice, shoot(9), ctxAt(21_000))).toBe(open);
    expect(onPlayerInput(open, alice, shoot(8), ctxAt(19_999))).toBe(open);
    for (const phase of ["intro", "reveal", "roundEnd", "over"] as const) {
      const other = { ...open, phase };
      expect(onPlayerInput(other, alice, shoot(8), ctxAt(21_000))).toBe(other);
    }
    const [, , , dan] = createPlayers(4);
    expect(onPlayerInput(open, dan!, shoot(8), ctxAt(21_000))).toBe(open);
  });

  it("shows a crosshair from the first aim sample, and hides it on lower so the player can draw again", () => {
    let state = onPlayerInput(
      openVolley(),
      bob,
      aim([-67, 0.1, 0.2], [0, 0.12, 0.2]),
      ctxAt(21_000),
    );
    expect(playerOf(state, bob.id)).toMatchObject({
      aiming: true,
      aim: [
        [20_933, 0.1, 0.2],
        [21_000, 0.12, 0.2],
      ],
    });
    expect(onPlayerInput(state, bob, lower(7), ctxAt(21_100))).toBe(state);
    state = onPlayerInput(state, bob, lower(8), ctxAt(21_100));
    expect(playerOf(state, bob.id)).toMatchObject({ aiming: false, aim: [], result: null });
    state = onPlayerInput(state, bob, shoot(8), ctxAt(21_200));
    expect(state.arrows).toHaveLength(1);
  });

  it("ignores aim outside open, and hides every crosshair when the volley closes", () => {
    const landing = timedOutVolley();
    expect(onPlayerInput(landing, bob, aim([0, 0, 0]), ctxAt(30_100))).toBe(landing);
    const aiming = onPlayerInput(openVolley(), bob, aim([0, 0, 0]), ctxAt(21_000));
    const closed = onTick({ ...aiming, nowMs: 30_000 - tickMs }, tickMs);
    expect(closed.phase).toBe("landing");
    expect(playerOf(closed, bob.id)).toMatchObject({ aiming: false, aim: [] });
  });

  it("marks arrows landed at their landing time", () => {
    let state = onPlayerInput(openVolley(), alice, shoot(8), ctxAt(21_000));
    state = onTick({ ...state, nowMs: 21_600 }, tickMs);
    expect(state.arrows[0]?.landed).toBe(false);
    state = onTick({ ...state, nowMs: 21_650 - tickMs }, tickMs);
    expect(state.arrows[0]?.landed).toBe(true);
  });
});

describe("scoring", () => {
  it("adds each arrow's points and bullseyes at the reveal, not before", () => {
    let state = onPlayerInput(openVolley(), alice, bullseye(openVolley()), ctxAt(21_000));
    state = onPlayerInput(state, bob, shoot(8, 0.5, 0.5), ctxAt(21_000));
    expect(playerOf(state, alice.id)).toMatchObject({ result: 10, points: 0, tens: 0 });
    const off = aimFor(openVolley(), 210, 130);
    state = onPlayerInput(state, cleo, shoot(8, off.yaw, off.pitch), ctxAt(21_000));
    const scoredCleo = playerOf(state, cleo.id).result as number;
    // 10 px from the centre of a 24 px target.
    expect(scoredCleo).toBe(6);
    state = tickUntil(state, "reveal");
    expect(state.players.map((player) => [player.last, player.points, player.tens])).toEqual([
      [10, 10, 1],
      [0, 0, 0],
      [scoredCleo, scoredCleo, 0],
    ]);
  });

  it("scores a perfect match 120 with 12 bullseyes", () => {
    const target = playMatch(12, 2, (volley, slot) =>
      slot === 0 ? { afterMs: 800, dx: 0, dy: 0 } : { afterMs: 900 + volley * 100, dx: 12, dy: 0 },
    );
    expect(target.state.phase).toBe("over");
    expect(target.state.players.map((player) => [player.points, player.tens])).toEqual([
      [120, 12],
      [expect.any(Number), 0],
    ]);
    expect(target.state.players[1]!.points).toBeLessThan(120);
  });
});

describe("match end and placements", () => {
  it("ends after round 4's round end, under 2 minutes when everyone shoots within 5 seconds", () => {
    const target = playMatch(4, 3, (_volley, slot) => ({
      afterMs: 3000 + slot * 500,
      dx: slot,
      dy: 0,
    }));
    const { state } = target;
    expect(state).toMatchObject({ phase: "over", round: 4, arrow: 3 });
    expect(target.nowMs).toBeGreaterThan(90_000);
    expect(target.nowMs).toBeLessThan(120_000);
  });

  it("returns no outcome until the last round end has been shown", () => {
    const target = room(1, 2);
    const roundEnd = stepUntil(target, "roundEnd", 12);
    expect(game.outcome(roundEnd)).toBeNull();
    const over = stepUntil(target, "over");
    expect(over.phaseAtMs - roundEnd.phaseAtMs).toBeCloseTo(roundEndMs, 6);
    expect(game.outcome(over)).not.toBeNull();
  });

  it("places by points, then by more bullseyes, and players still tied share a place", () => {
    const base = init([alice, bob, cleo, ...createPlayers(4).slice(3)], 1);
    const scores: Array<[number, number]> = [
      [90, 3],
      [95, 1],
      [90, 5],
      [90, 3],
    ];
    const state = {
      ...base,
      phase: "over" as const,
      players: base.players.map((player, i) => ({
        ...player,
        points: scores[i]![0],
        tens: scores[i]![1],
      })),
    };
    const [a, b, c, d] = state.players.map((player) => player.id);
    expect(outcome(state)?.placements).toEqual([
      { playerId: b, place: 1, score: 95 },
      { playerId: c, place: 2, score: 90 },
      { playerId: a, place: 3, score: 90 },
      { playerId: d, place: 3, score: 90 },
    ]);
  });

  it("gives everyone first place when nobody hits anything", () => {
    const target = playMatch(8, 2, () => null);
    expect(target.outcome()?.placements).toEqual([
      { playerId: alice.id, place: 1, score: 0 },
      { playerId: bob.id, place: 1, score: 0 },
    ]);
  });

  it("returns null while the match runs", () => {
    expect(outcome(openVolley())).toBeNull();
    expect(outcome({ ...openVolley(), phase: "roundEnd" })).toBeNull();
  });
});

describe("onPlayerLeft", () => {
  it("keeps the leaver's points and an arrow already shot, and stops waiting for them", () => {
    let state = onPlayerInput(openVolley(), alice, bullseye(openVolley()), ctxAt(21_000));
    state = { ...state, players: state.players.map((player) => ({ ...player, points: 20 })) };
    state = onPlayerLeft(state, alice);
    state = onPlayerLeft(state, cleo);
    expect(onPlayerInput(state, cleo, shoot(8), ctxAt(21_000))).toBe(state);
    state = onPlayerInput(state, bob, shoot(8, 1, 1), ctxAt(21_000));
    state = onTick(state, tickMs);
    expect(state.phase).toBe("landing");
    state = tickUntil(state, "reveal");
    expect(state.players.map((player) => [player.points, player.left])).toEqual([
      [30, true],
      [20, false],
      [20, true],
    ]);
  });

  it("goes on with one player, and ends the match with placements when nobody is seated", () => {
    const target = room(2, 8);
    stepUntil(target, "open", 2);
    target.leave(bob.id);
    expect(target.over).toBe(false);
    target.leave(alice.id);
    expect(target.over).toBe(true);
    expect(target.outcome()?.placements.map((placement) => placement.place)).toEqual([1, 1]);
  });

  it("ignores a player who already left, an unknown player and a finished match", () => {
    const left = onPlayerLeft(openVolley(), cleo);
    expect(onPlayerLeft(left, cleo)).toBe(left);
    const [, , , dan] = createPlayers(4);
    expect(onPlayerLeft(left, dan!)).toBe(left);
    const over = { ...left, phase: "over" as const };
    expect(onPlayerLeft(over, alice)).toBe(over);
  });
});

describe("fixed step", () => {
  it("lines phase changes up with the 60 Hz tick grid", () => {
    const target = room(2, 3);
    const open = stepUntil(target, "open");
    expect(open.openAtMs).toBeCloseTo(tickTimeMs(150), 6);
  });
});
