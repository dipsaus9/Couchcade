import { describe, expect, it } from "vitest";
import { createFakeRoom, createPlayers, replay } from "@couchcade/game-sdk/testing";
import game from "../src/index.ts";
import type { PuttClubState } from "../src/shared/state.ts";

function advanceTo(
  room: ReturnType<typeof createFakeRoom>,
  predicate: (state: PuttClubState) => boolean,
  maxTicks = 60 * 60 * 30,
): void {
  for (let i = 0; i < maxTicks && !predicate(room.state as PuttClubState) && !room.over; i++) {
    room.step();
  }
}

/**
 * Records a short 2-player match covering a rolled (unfinished) putt, a full-power putt and an
 * auto-putt from a dropped phone, mixing manual `aim`/`line`/`putt` input with `onTick`'s own
 * deterministic decisions, then checks the recorded events replay to the exact same final state
 * (docs/games/putt-club.md, acceptance criterion 5).
 */
describe("recorded match", () => {
  it("replays to the exact final state and outcome", () => {
    const players = createPlayers(2);
    const room = createFakeRoom(game, { players, seed: 7 });

    advanceTo(room, (s) => s.phase === "turn");
    const firstPutter = room.state.putterId as string;

    // Player 1: an aim sample, a locked line, then a soft putt that just rolls (doesn't hole).
    room.input(firstPutter, { type: "aim", payload: { yaw: 0, pitch: 0 } });
    room.input(firstPutter, {
      type: "line",
      payload: { turn: room.state.turn, locked: true, yaw: 0 },
    });
    room.input(firstPutter, {
      type: "putt",
      payload: { turn: room.state.turn, yaw: 0.02, speed: 0.05, angle: 3 },
    });
    advanceTo(room, (s) => s.phase === "result");
    advanceTo(room, (s) => s.phase === "turn");

    // Player 2: a full-power putt straight at the cup, likely a lip-out or a bounce off a kerb.
    const secondPutter = room.state.putterId as string;
    room.input(secondPutter, {
      type: "putt",
      payload: { turn: room.state.turn, yaw: 0, speed: 1, angle: 0 },
    });
    advanceTo(room, (s) => s.phase === "result");
    advanceTo(room, (s) => s.phase === "turn");

    // Whoever's up now: dropped phone. No input at all, so the turn timer auto-putts.
    advanceTo(room, (s) => s.phase === "result", 60 * 20);
    advanceTo(room, (s) => s.phase === "turn" || s.phase === "holeIntro");

    const recording = JSON.parse(JSON.stringify(room.recording()));
    expect(
      recording.events.some((event: { input: { type: string } }) => event.input.type === "aim"),
    ).toBe(true);
    expect(
      recording.events.some((event: { input: { type: string } }) => event.input.type === "line"),
    ).toBe(true);
    expect(
      recording.events.some((event: { input: { type: string } }) => event.input.type === "putt"),
    ).toBe(true);

    const replayed = replay(game, recording);
    expect(replayed).toStrictEqual(room.state);
    expect(game.outcome(replayed)).toStrictEqual(game.outcome(room.state));

    // Confirms the auto-putt actually happened (it isn't in the recording as an "event": it's
    // deterministic from onTick, not an input), so the last stroke of this run is provably an
    // auto-putt and it still replays exactly.
    const state = room.state as PuttClubState;
    const strokesTotal = state.players.reduce((sum, player) => sum + player.strokes, 0);
    expect(strokesTotal).toBeGreaterThanOrEqual(3);
    expect(state.players.some((player) => player.last?.auto === true)).toBe(true);
  });
});
