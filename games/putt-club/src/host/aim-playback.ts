/**
 * The putter's aim yaw on the TV (docs/games/putt-club.md, "Fairness": "The putt carries the line
 * you saw" replays the phone's own streamed samples through the same `createPlayback`, the same
 * delay behind (CC-11.10) -- so the live aim line the TV draws here has to use that exact
 * function too, the same pattern Target Range's `aim-playback.ts` already established.
 *
 * Only one player ever aims at a time (`state.putterId`), so this keeps one `Playback` and resets
 * it whenever the putter changes -- `state.aim` itself is cleared every turn (`openTurn`), so a
 * stale sample from the previous putter could otherwise leak one frame of catch-up easing.
 */
import { createPlayback } from "@couchcade/game-sdk/input";
import type { Playback } from "@couchcade/game-sdk/input";
import type { PuttClubState } from "../shared/index.ts";

export interface AimPlayback {
  /** This frame's yaw for `state.putterId` during `turn`, or `null` with nothing to show yet. */
  at(state: PuttClubState, frameMs: number, delayMs: number): number | null;
}

export function createAimPlayback(): AimPlayback {
  let putterId: string | null = null;
  let playback: Playback<[number, number]> = createPlayback<[number, number]>();

  return {
    at(state, frameMs, delayMs) {
      if (state.phase !== "turn" || state.putterId === null) {
        putterId = null;
        return null;
      }
      if (state.putterId !== putterId) {
        putterId = state.putterId;
        playback = createPlayback<[number, number]>();
      }
      const value = playback.at(state.aim, state.nowMs, delayMs, frameMs);
      return value === null ? null : value[0];
    },
  };
}
