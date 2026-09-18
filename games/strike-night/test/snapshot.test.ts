import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { maxGameSnapshotBytes } from "@couchcade/game-sdk/contract";
import { frameCount, init, restore, snapshot } from "../src/shared/index.ts";
import { bowlAndSettle, room, strikeThrow } from "./helpers.ts";

describe("snapshot and restore", () => {
  it("only changes when a frame ends", () => {
    const target = room(1);
    let last = JSON.stringify(snapshot(target.state));
    const changedAt: string[] = [];
    for (let i = 0; i < 60 * 60 * 30 && target.state.frame <= 2 && !target.over; i++) {
      const before = target.state.phase;
      if (target.state.phase === "lineup") bowlAndSettle(target, strikeThrow);
      else target.step();
      const current = JSON.stringify(snapshot(target.state));
      if (current !== last) changedAt.push(`${before} -> ${target.state.phase}`);
      last = current;
    }
    expect(changedAt.length).toBeGreaterThan(0);
    expect(changedAt.every((entry) => entry.startsWith("frameEnd"))).toBe(true);
  });

  // A full 4-player match played out roll by roll through real physics; a slower CI runner can
  // take longer than vitest's default 5 s (see @couchcade/game-sdk/testing's contract kit for
  // the same reasoning), so this and the two other full-playthrough tests below get 30 s.
  it("stays well under the game snapshot budget for 4 players", () => {
    const players = createPlayers(4);
    const target = room(players, 1);
    for (let i = 0; i < 60 * 60 * 200 && target.state.frame < frameCount && !target.over; i++) {
      if (target.state.phase === "lineup") bowlAndSettle(target, strikeThrow);
      else target.step();
    }
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot(target.state))).length;
    expect(bytes).toBeLessThanOrEqual(maxGameSnapshotBytes);
  }, 30_000);

  it("restores at the next frame's first roll with the same points", () => {
    const target = room(2);
    for (let i = 0; i < 60 * 60 * 60 && target.state.frame < 2 && !target.over; i++) {
      if (target.state.phase === "lineup") bowlAndSettle(target, strikeThrow);
      else target.step();
    }
    const saved = JSON.parse(JSON.stringify(snapshot(target.state)));
    expect(saved.f).toBe(2);
    const restored = restore(target.players, 99, saved);
    expect(restored.phase).toBe("lineup");
    expect(restored.frame).toBe(2);
    expect(restored.roll).toBe(1);
    expect(restored.nowMs).toBe(0);
    expect(restored.players.map((player) => player.x)).toEqual([0, 0]);
    expect(restored.players.map((player) => player.total)).toEqual(
      target.state.players.map((player) => player.total),
    );
  }, 30_000);

  it("starts a new match from a snapshot that doesn't parse", () => {
    const players = createPlayers(2);
    expect(restore(players, 9, null)).toStrictEqual(init(players, 9));
    expect(restore(players, 9, { f: "two" })).toStrictEqual(init(players, 9));
  });

  it("gives a player missing from the snapshot 0 points", () => {
    const players = createPlayers(2);
    const saved = { f: 2, pts: { [players[0]!.id]: 40 }, st: {}, sp: {}, fr: {} };
    const restored = restore(players, 9, saved);
    expect(restored.players.map((player) => player.total)).toEqual([40, 0]);
  });

  it("restores a finished match as over, with its placements", () => {
    const target = room(1);
    for (let i = 0; i < 60 * 60 * 200 && !target.over; i++) {
      if (target.state.phase === "lineup") bowlAndSettle(target, strikeThrow);
      else target.step();
    }
    expect(target.over).toBe(true);
    const saved = snapshot(target.state);
    const restored = restore(target.players, 1, saved);
    expect(restored.phase).toBe("over");
    expect(target.game.outcome(restored)).toEqual(target.outcome());
  }, 30_000);
});
