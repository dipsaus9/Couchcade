/**
 * Crosshair playback on the TV (CC-11.9, docs/architecture/realtime-link.md, "Smoothing on the
 * relay path", "Smoothing on the direct path" and "The phone decides its own shot"). One
 * `Playback` per player, kept for as long as the scene runs: interpolates between aim samples,
 * predicts briefly past the newest one, eases toward a corrected value without jumping, and snaps
 * to a shot's exact aim over `crosshairSnapMs`.
 *
 * `present()` (`present.ts`) stays a pure function of `TState`: it only threads through whatever
 * crosshairs it's given. This is the stateful piece the scene calls once a frame, alongside the
 * other per-frame state it already keeps outside `TState` (`RangeWorld`'s Phaser actors).
 *
 * A shot's aim is never read from here (`../controller/aim.ts`'s `shoot` carries it, per "The
 * phone decides its own shot"). Since CC-11.10, the controller keeps this in sync by replaying its
 * own streamed samples through the same `createPlayback`, the same delay behind: the phone can't
 * learn this file's exact per-connection `playbackDelayMs` (host-only, and no message carries it),
 * so it mirrors `apps/host/src/runtime/links.ts`'s two constants instead -- `relayPlaybackDelayMs`
 * and `directPlaybackDelayMs`, picked by `channel.path` -- which is what `scene.ts`'s
 * `playbackDelayMsOf` actually calls this with today (jitter isn't measured yet, so both sides
 * assume none). The two sides land on the same "shown" aim without ever exchanging that number.
 *
 * ```ts
 * const playback = createCrosshairPlayback();
 * // Each frame: const crosshairs = playback.at(state, frameMs, (id) => host.link?.(id)?.playbackDelayMs ?? fallbackMs);
 * ```
 */
import { createPlayback } from "@couchcade/game-sdk/input";
import type { Playback } from "@couchcade/game-sdk/input";
import { aimPoint, volleyOf } from "../shared/index.ts";
import type { Arrow, TargetRangeState } from "../shared/index.ts";
import type { CrosshairPresentation } from "./present.ts";

/** How long a shot's snap takes (realtime-link.md, "The phone decides its own shot", rule 3). */
export const crosshairSnapMs = 60;

export interface CrosshairPlayback {
  /**
   * Every aiming player's crosshair, in seat order, at `state.nowMs`, `delayMs(id)` behind. A
   * player whose shot just landed in `state.arrows` snaps to it over `crosshairSnapMs`, the frame
   * that arrow first appears. `frameMs` is the time since the previous call.
   */
  at(
    state: TargetRangeState,
    frameMs: number,
    delayMs: (playerId: string) => number,
  ): CrosshairPresentation[];
}

const arrowKey = (arrow: Arrow): string => `${arrow.volley}:${arrow.playerId}`;

/** Builds one match's crosshair playback. A fresh one per scene run, like `RangeWorld`'s actors. */
export function createCrosshairPlayback(): CrosshairPlayback {
  const players = new Map<string, Playback<[number, number]>>();
  const snapped = new Set<string>();

  const playerOf = (id: string): Playback<[number, number]> => {
    let playback = players.get(id);
    if (playback === undefined) {
      playback = createPlayback<[number, number]>();
      players.set(id, playback);
    }
    return playback;
  };

  return {
    at(state, frameMs, delayMs) {
      const volley = volleyOf(state);
      const shots = state.arrows.filter((arrow) => arrow.volley === volley);
      for (const shot of shots) {
        const key = arrowKey(shot);
        if (snapped.has(key)) continue;
        snapped.add(key);
        playerOf(shot.playerId).snap([shot.aim.yaw, shot.aim.pitch], crosshairSnapMs);
      }

      const crosshairs: CrosshairPresentation[] = [];
      if (state.phase !== "open") return crosshairs;
      for (const player of state.players) {
        if (!player.aiming || player.left) continue;
        const value = playerOf(player.id).at(player.aim, state.nowMs, delayMs(player.id), frameMs);
        if (value === null) continue;
        const point = aimPoint({ yaw: value[0], pitch: value[1] });
        crosshairs.push({ id: player.id, x: Math.round(point.x), y: Math.round(point.y) });
      }
      return crosshairs;
    },
  };
}
