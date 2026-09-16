import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import { onPlayerInput, restore, view } from "../src/shared/index.ts";
import game from "../src/index.ts";
import { ctxAt, playMatch, room, stepThrough, stepUntil, tap, tapAt } from "./helpers.ts";

const [alice, bob, cleo] = createPlayers(3) as [Player, Player, Player];

describe("view", () => {
  it("shows qd-watch in round 1's intro and qd-standoff with a your-turn cue during round 1", () => {
    const target = room([alice, bob], 2);
    expect(target.view(alice.id)).toEqual({
      screen: "qd-watch",
      data: { round: 1, target: 3, points: 0 },
    });
    stepUntil(target, "standoff");
    const standoff = target.view(alice.id);
    expect(standoff).toEqual({
      screen: "qd-standoff",
      data: { round: 1, target: 3, points: 0 },
      cue: "your-turn",
    });
    stepUntil(target, "draw");
    expect(target.view(alice.id)).toEqual(standoff);
  });

  it("doesn't change when a player fouls during the standoff", () => {
    const target = room([alice, bob], 2);
    const standoff = stepUntil(target, "standoff");
    const before = target.view(alice.id);
    const after = onPlayerInput(standoff, alice, tap(1), ctxAt(standoff.nowMs, standoff.nowMs));
    expect(after.players[0]?.result?.kind).toBe("foul");
    expect(view(after, alice)).toEqual(before);
  });

  it("shows won, lost, foul and slow results with the winner's name and cues", () => {
    const target = room([alice, bob, cleo], 4);
    const draw = stepUntil(target, "draw");
    const drawAtMs = draw.drawAtMs as number;
    tapAt(target, bob.id, drawAtMs + 50);
    tapAt(target, cleo.id, drawAtMs + 301);
    tapAt(target, alice.id, drawAtMs + 243);
    stepUntil(target, "result");

    expect(target.view(alice.id)).toEqual({
      screen: "qd-result",
      data: { round: 1, target: 3, points: 1, result: "won", ms: 243, winner: "Player 1" },
      cue: "celebrate",
    });
    expect(target.view(bob.id)).toEqual({
      screen: "qd-result",
      data: { round: 1, target: 3, points: 0, result: "foul", ms: null, winner: "Player 1" },
      cue: "foul",
    });
    expect(target.view(cleo.id)).toEqual({
      screen: "qd-result",
      data: { round: 1, target: 3, points: 0, result: "lost", ms: 301, winner: "Player 1" },
    });
  });

  it("shows slow with no winner when nobody tapped", () => {
    const target = room([alice, bob], 4);
    stepUntil(target, "result");
    expect(target.view(bob.id)).toEqual({
      screen: "qd-result",
      data: { round: 1, target: 3, points: 0, result: "slow", ms: null, winner: null },
    });
  });

  it("keeps the last result through the next intro", () => {
    const target = room([alice, bob], 4);
    stepUntil(target, "result");
    const result = target.view(alice.id);
    stepUntil(target, "intro", 2);
    expect(target.view(alice.id)).toEqual(result);
    const standoff = stepUntil(target, "standoff", 2);
    expect(target.view(alice.id)).toEqual({
      screen: "qd-standoff",
      data: { round: 2, target: 3, points: 0 },
    });
    expect(standoff.round).toBe(2);
  });

  it("shows qd-watch after a restore, which has no previous result", () => {
    const restored = restore([alice, bob], 2, {
      round: 3,
      rng: 5,
      words: 0,
      players: { [alice.id]: [1, 250] },
    });
    expect(view(restored, alice)).toEqual({
      screen: "qd-watch",
      data: { round: 3, target: 3, points: 1 },
    });
  });

  it("changes exactly twice per round after the first view, so the host sends two batches", () => {
    const target = playMatch(17, 3, (round, slot) => (slot === round % 3 ? 220 : 260 + slot));
    // Replay the same match and count view changes per player.
    const changes = [0, 0, 0];
    let last = target.players.map((player) =>
      JSON.stringify(game.view(game.init(target.players, 17), player)),
    );
    const again = stepThrough(target.recording(), (step) => {
      const views = step.players.map((player) => JSON.stringify(step.view(player.id)));
      views.forEach((current, i) => {
        if (current !== last[i]) changes[i] = (changes[i] ?? 0) + 1;
      });
      last = views;
    });
    const rounds = again.state.round;
    expect(changes).toEqual([2 * rounds, 2 * rounds, 2 * rounds]);
  });
});
