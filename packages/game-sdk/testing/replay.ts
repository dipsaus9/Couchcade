import type { CouchcadeGame, GameInput } from "../src/contract/index.ts";
import type { JsonValue } from "@couchcade/protocol";
import { createFakeRoom } from "./fake-room.ts";
import type { Recording } from "./fake-room.ts";

export interface ReplayOptions {
  /** Passed to every `InputContext`. Defaults to 0. */
  displayLagMs?: number;
}

/**
 * Plays a recording and returns the final state. Inputs are applied at their recorded tick, in
 * recorded order, through a fake room. Playback stops at `recording.ticks` (or the last event)
 * or when the game is over, whichever comes first.
 */
export function replay<TInput extends GameInput, TState, TView extends JsonValue>(
  game: CouchcadeGame<TInput, TState, TView>,
  recording: Recording,
  { displayLagMs = 0 }: ReplayOptions = {},
): TState {
  if (recording.gameId !== game.id) {
    throw new Error(`Recording is for ${recording.gameId}, not ${game.id}`);
  }
  const room = createFakeRoom(game, {
    players: recording.players,
    seed: recording.seed,
    displayLagMs,
  });

  let lastTick = 1;
  for (const event of recording.events) {
    if (!Number.isInteger(event.tick) || event.tick < lastTick) {
      throw new RangeError(`Recording events must be in tick order from tick 1, got ${event.tick}`);
    }
    lastTick = event.tick;
    room.step(event.tick - 1 - room.tick);
    if (room.over) return room.state;
    room.input(event.playerId, event.input, event.atMs);
  }
  const end = Math.max(recording.ticks ?? 0, recording.events.at(-1)?.tick ?? 0);
  room.step(end - room.tick);
  return room.state;
}
