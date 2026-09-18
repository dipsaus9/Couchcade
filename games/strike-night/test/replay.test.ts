import { describe, expect, it } from "vitest";
import { createFakeRoom, createPlayers, replay } from "@couchcade/game-sdk/testing";
import game from "../src/index.ts";
import { frameComplete } from "../src/shared/index.ts";
import {
  bowlInput,
  gutterThrow,
  openThrow,
  spareFinishThrow,
  spareSetupThrow,
  strikeThrow,
} from "./helpers.ts";

/**
 * Records a short 2-player match covering a strike, an open frame, a spare and a gutter roll
 * (mixing manual bowls with an auto-roll from a dropped phone), then checks the recorded events
 * replay to the exact same final state (docs/games/strike-night.md, acceptance criterion 5).
 */
describe("recorded match", () => {
  it("replays to the exact final state and outcome", () => {
    const players = createPlayers(2);
    const room = createFakeRoom(game, { players, seed: 7 });

    const bowlersTurn = (): { turn: number } => ({ turn: room.state.turn });

    const advanceToLineup = (): void => {
      for (let i = 0; i < 60 * 60 * 20 && room.state.phase !== "lineup"; i++) room.step();
    };
    const advanceToResult = (): void => {
      for (let i = 0; i < 60 * 60 * 20 && room.state.phase !== "result"; i++) room.step();
    };

    // Frame 1, player 1: a strike.
    advanceToLineup();
    room.input(
      room.state.bowlerId as string,
      bowlInput(bowlersTurn().turn, strikeThrow),
      room.nowMs,
    );
    advanceToResult();

    // Frame 1, player 2: an open roll 1 (a `move` first), then a gutter roll 2.
    advanceToLineup();
    const player2 = room.state.bowlerId as string;
    room.input(player2, { type: "move", payload: { turn: room.state.turn, x: 0 } }, room.nowMs);
    room.input(player2, bowlInput(room.state.turn, openThrow), room.nowMs + 10);
    advanceToResult();
    advanceToLineup();
    room.input(room.state.bowlerId as string, bowlInput(room.state.turn, gutterThrow), room.nowMs);
    advanceToResult();

    // Frame 2, player 1: a grip, then a dropped phone for the rest of the frame. The turn timer
    // auto-rolls every remaining roll (once, or twice if roll 1 isn't a strike).
    advanceToLineup();
    room.input(
      room.state.bowlerId as string,
      { type: "grip", payload: { turn: room.state.turn, held: true } },
      room.nowMs,
    );
    advanceToResult();
    while (!frameComplete(room.state.players[0]!.frames[1]!)) {
      advanceToLineup();
      advanceToResult();
    }

    // Frame 2, player 2: leaves a single pin, then clears it for a spare.
    advanceToLineup();
    room.input(
      room.state.bowlerId as string,
      bowlInput(room.state.turn, spareSetupThrow),
      room.nowMs,
    );
    advanceToResult();
    advanceToLineup();
    room.input(
      room.state.bowlerId as string,
      bowlInput(room.state.turn, spareFinishThrow),
      room.nowMs,
    );
    advanceToResult();

    const recording = JSON.parse(JSON.stringify(room.recording()));
    expect(
      recording.events.some((event: { input: { type: string } }) => event.input.type === "move"),
    ).toBe(true);
    expect(
      recording.events.some((event: { input: { type: string } }) => event.input.type === "grip"),
    ).toBe(true);

    const replayed = replay(game, recording);
    expect(replayed).toStrictEqual(room.state);
    expect(game.outcome(replayed)).toStrictEqual(game.outcome(room.state));

    // Confirms the auto-roll actually happened (it isn't in the recording as an "event": it's
    // deterministic from onTick, not an input), so the frame-2-player-1 roll is provably an
    // auto-roll and still replays exactly.
    const autoRoller = room.state.players[0]!;
    expect(autoRoller.frames[1]!.roll1).not.toBeNull();
    expect(autoRoller.last?.auto).toBe(true);
  });
});
