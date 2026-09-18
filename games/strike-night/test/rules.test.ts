import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import {
  awayInputExtensionMs,
  awayTurnTimerMs,
  init,
  onPlayerInput,
  onPlayerLeft,
  outcome,
  turnTimerMs,
} from "../src/shared/index.ts";
import type { StrikeNightState } from "../src/shared/index.ts";
import {
  bowlAndSettle,
  bowlNow,
  ctxAt,
  gutterThrow,
  openThrow,
  room,
  spareFinishThrow,
  spareSetupThrow,
  stepUntil,
  strikeThrow,
} from "./helpers.ts";

describe("scoring (current-frame scoring, owner decision 1)", () => {
  it("scores a strike as 30 and completes the frame in one roll", () => {
    const state = bowlAndSettle(room(1), strikeThrow);
    const player = state.players[0]!;
    expect(player.frames[0]).toEqual({ roll1: 10, roll2: null, score: 30 });
    expect(player.last).toEqual({ pins: 10, mark: "strike", auto: false, frame: 30 });
    expect(player.strikes).toBe(1);
    expect(player.spares).toBe(0);
  });

  it("scores an open frame as roll 1 plus roll 2", () => {
    const target = room(1);
    stepUntil(target, "lineup");
    bowlNow(target, openThrow);
    const afterRoll1 = stepUntil(target, "result");
    const roll1Pins = afterRoll1.players[0]!.frames[0]!.roll1 as number;
    expect(roll1Pins).toBeGreaterThan(0);
    expect(roll1Pins).toBeLessThan(10);

    stepUntil(target, "lineup");
    bowlNow(target, gutterThrow); // a gutter roll 2: knocks nothing further down
    const afterRoll2 = stepUntil(target, "result");
    const player = afterRoll2.players[0]!;
    expect(player.frames[0]!.roll2).toBe(0);
    expect(player.frames[0]!.score).toBe(roll1Pins);
    expect(player.last?.mark).toBe("gutter");
  });

  it("scores a spare as 10 plus roll 1, and counts it on the player", () => {
    const target = room(1);
    stepUntil(target, "lineup");
    bowlNow(target, spareSetupThrow);
    stepUntil(target, "result");
    stepUntil(target, "lineup");
    bowlNow(target, spareFinishThrow);
    const state = stepUntil(target, "result");
    const player = state.players[0]!;
    const frame = player.frames[0]!;
    expect(frame.roll1).toBeGreaterThan(0);
    expect(frame.roll1).toBeLessThan(10);
    expect(frame.roll2).toBeGreaterThan(0);
    expect((frame.roll1 as number) + (frame.roll2 as number)).toBe(10);
    expect(frame.score).toBe(10 + (frame.roll1 as number));
    expect(player.last?.mark).toBe("spare");
    expect(player.spares).toBe(1);
  });

  it("a gutter ball scores 0 and marks the roll gutter, not open", () => {
    const state = bowlAndSettle(room(1), gutterThrow);
    const player = state.players[0]!;
    expect(player.frames[0]!.roll1).toBe(0);
    expect(player.last?.mark).toBe("gutter");
  });
});

describe("turn order and frame flow", () => {
  it("moves to the next active player's roll 1 after a strike", () => {
    const target = room(2);
    const firstBowlerId = stepUntil(target, "lineup").bowlerId;
    bowlAndSettle(target, strikeThrow);
    const next = stepUntil(target, "lineup");
    expect(next.frame).toBe(1);
    expect(next.roll).toBe(1);
    expect(next.bowlerId).not.toBe(firstBowlerId);
  });

  it("keeps the same bowler for roll 2 after an open roll 1", () => {
    const target = room(2);
    const bowlerId = stepUntil(target, "lineup").bowlerId;
    bowlAndSettle(target, openThrow);
    const next = stepUntil(target, "lineup");
    expect(next.frame).toBe(1);
    expect(next.roll).toBe(2);
    expect(next.bowlerId).toBe(bowlerId);
  });
});

describe("turn timer, auto-roll and away players", () => {
  it("auto-rolls a gentle straight ball once the 20 s timer plus the wait elapses", () => {
    const target = room(1);
    stepUntil(target, "lineup");
    const state = stepUntil(target, "result"); // never sends an input: only the timer can get here
    expect(state.players[0]!.last?.auto).toBe(true);
    expect(state.players[0]!.last?.mark).not.toBe(undefined);
  });

  it("gives every roll a 20 s timer by default", () => {
    const lineup = stepUntil(room(1), "lineup");
    expect(lineup.deadlineMs).toBe(lineup.phaseAtMs + turnTimerMs);
    expect(lineup.awayAtLineupStart).toBe(false);
  });

  it("marks a player away after 2 auto-rolls, shortening their next timer to 5 s", () => {
    const target = room(1);
    for (let i = 0; i < 2; i++) {
      stepUntil(target, "rolling");
      stepUntil(target, "result");
    }
    const lineup = stepUntil(target, "lineup");
    expect(lineup.awayAtLineupStart).toBe(true);
    expect(lineup.deadlineMs).toBe(lineup.phaseAtMs + awayTurnTimerMs);
  });

  it("clears the away extension once the bowler sends any accepted input", () => {
    const target = room(1);
    for (let i = 0; i < 2; i++) {
      stepUntil(target, "rolling");
      stepUntil(target, "result");
    }
    const lineup = stepUntil(target, "lineup");
    expect(lineup.awayAtLineupStart).toBe(true);
    const bowler = target.players[0]!;
    const ctx = ctxAt(lineup.phaseAtMs + 1000);
    const next = onPlayerInput(
      lineup,
      bowler,
      { type: "move", payload: { turn: lineup.turn, x: 0.1 } },
      ctx,
    );
    expect(next.deadlineMs).toBe(ctx.atMs + awayInputExtensionMs);
    expect(next.deadlineMs as number).toBeGreaterThan(lineup.deadlineMs as number);
  });

  it("ignores a bowl whose turn doesn't match the current one", () => {
    const target = room(1);
    const lineup = stepUntil(target, "lineup");
    const bowler = target.players[0] as (typeof target.players)[number];
    const stale = onPlayerInput(
      lineup,
      bowler,
      { type: "bowl", payload: { turn: lineup.turn + 1, ...strikeThrow } },
      ctxAt(lineup.phaseAtMs),
    );
    expect(stale).toStrictEqual(lineup);
  });

  it("ignores a bowl that arrives after the deadline", () => {
    const target = room(1);
    const lineup = stepUntil(target, "lineup");
    const bowler = target.players[0] as (typeof target.players)[number];
    const late = onPlayerInput(
      lineup,
      bowler,
      { type: "bowl", payload: { turn: lineup.turn, ...strikeThrow } },
      ctxAt((lineup.deadlineMs as number) + 1),
    );
    expect(late).toStrictEqual(lineup);
  });
});

describe("placements and win conditions", () => {
  it("places by total points, most first", () => {
    const players = createPlayers(3);
    const state = init(players, 1);
    const finished: StrikeNightState = {
      ...state,
      phase: "over",
      players: state.players.map((player, i) => ({
        ...player,
        total: [80, 120, 100][i] as number,
      })),
    };
    expect(outcome(finished)?.placements).toEqual([
      { playerId: players[1]!.id, place: 1, score: 120 },
      { playerId: players[2]!.id, place: 2, score: 100 },
      { playerId: players[0]!.id, place: 3, score: 80 },
    ]);
  });

  it("breaks a tie in points with more strikes, then more spares", () => {
    const players = createPlayers(3);
    const state = init(players, 1);
    const finished: StrikeNightState = {
      ...state,
      phase: "over",
      players: state.players.map((player, i) => ({
        ...player,
        total: 100,
        strikes: [3, 5, 3][i] as number,
        spares: [1, 0, 9][i] as number,
      })),
    };
    expect(outcome(finished)?.placements).toEqual([
      { playerId: players[1]!.id, place: 1, score: 100 },
      { playerId: players[2]!.id, place: 2, score: 100 },
      { playerId: players[0]!.id, place: 3, score: 100 },
    ]);
  });

  it("shares a place between players still tied on everything", () => {
    const players = createPlayers(2);
    const state = init(players, 1);
    const finished: StrikeNightState = {
      ...state,
      phase: "over",
      players: state.players.map((player) => ({ ...player, total: 50 })),
    };
    expect(outcome(finished)?.placements).toEqual([
      { playerId: players[0]!.id, place: 1, score: 50 },
      { playerId: players[1]!.id, place: 1, score: 50 },
    ]);
  });

  it("is null while the match is still running", () => {
    expect(outcome(stepUntil(room(1), "lineup"))).toBeNull();
  });
});

describe("players leaving (onPlayerLeft)", () => {
  it("passes the turn at once when the bowler's seat expires during lineup", () => {
    const target = room(2);
    const lineup = stepUntil(target, "lineup");
    const bowlerId = lineup.bowlerId as string;
    const leaving = target.players.find(
      (player) => player.id === bowlerId,
    ) as (typeof target.players)[number];
    const next = onPlayerLeft(lineup, leaving);
    expect(next.phase).toBe("lineup");
    expect(next.bowlerId).not.toBe(bowlerId);
    expect(next.players.find((player) => player.id === bowlerId)?.left).toBe(true);
  });

  it("keeps a left player's points and skips their remaining frames", () => {
    const target = room(2);
    stepUntil(target, "lineup");
    const scored = bowlAndSettle(target, strikeThrow);
    const bowlerId = scored.players.find((player) => player.last !== null)?.id as string;
    const leaving = target.players.find(
      (player) => player.id === bowlerId,
    ) as (typeof target.players)[number];
    const before = scored.players.find((player) => player.id === bowlerId)?.total as number;
    const next = onPlayerLeft(scored, leaving);
    expect(next.players.find((player) => player.id === bowlerId)?.total).toBe(before);
    expect(next.players.find((player) => player.id === bowlerId)?.left).toBe(true);
  });

  it("ends the match once every seat has expired", () => {
    const target = room(2);
    let state = stepUntil(target, "lineup");
    for (const player of target.players) state = onPlayerLeft(state, player);
    expect(state.phase).toBe("over");
  });
});
