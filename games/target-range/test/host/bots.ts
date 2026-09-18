import { tickTimeMs } from "@couchcade/game-sdk/contract";
import type { Player } from "@couchcade/game-sdk/contract";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { volleyOf } from "../../src/shared/index.ts";
import type { TargetRangeInput, TargetRangeState } from "../../src/shared/index.ts";
import { aim, aimFor, room, shoot } from "../helpers.ts";
import type { TargetRangeRoom } from "../helpers.ts";

/**
 * A bot's volley: it starts aiming `aimFromMs` after the volley opened, wanders towards its aim
 * and lets go at `shootMs`, landing `dx`/`dy` world px from the target centre. `shootMs` null
 * aims without shooting, so the crosshair stays up until the volley closes.
 */
export interface BotShot {
  aimFromMs: number;
  shootMs: number | null;
  dx: number;
  dy: number;
  power?: number;
}

export type BotPlan = (volley: number, slot: number, state: TargetRangeState) => BotShot | null;

const names = ["Noor", "Sam", "Kim", "Alex", "Jo", "Rin", "Maxine", "Theo"];

/** `count` players with short real names, so screenshots and name layouts look like a real room. */
export function namedPlayers(count: number): Player[] {
  return createPlayers(count).map((player, index) => ({
    ...player,
    name: names[index] ?? player.name,
  }));
}

const clampUnit = (value: number): number => Math.min(1, Math.max(-1, value));
const twoDecimals = (value: number): number => Math.round(value * 100) / 100;

/** How often a bot's phone streams an aim sample: the InputChannel's 30 Hz direct-path cap
 * (docs/architecture/realtime-link.md, "Rates"). */
const sampleMs = 1000 / 30;

/**
 * A room whose bots aim and shoot per `plan`. Call `step()` once per frame: it queues the inputs
 * due on the next tick and runs that tick, like the host runtime does between two TV frames.
 */
export function botRoom(
  players: number | readonly Player[],
  seed: number,
  plan: BotPlan,
): { room: TargetRangeRoom; step: () => TargetRangeState } {
  const target = room(typeof players === "number" ? namedPlayers(players) : players, seed);
  let plannedVolley = 0;
  let pending: Array<{ playerId: string; atMs: number; input: TargetRangeInput }> = [];

  const planVolley = (state: TargetRangeState): void => {
    const volley = volleyOf(state);
    const openAtMs = state.openAtMs as number;
    pending = [];
    state.players.forEach((player, slot) => {
      const shot = plan(volley, slot, state);
      if (shot === null) return;
      const power = shot.power ?? 1;
      const final = aimFor(state, state.target.x + shot.dx, state.target.y + shot.dy, power);
      const endMs = shot.shootMs ?? 9_500;
      // The aim drifts in from off target and settles, with a small wobble.
      const aimAt = (ms: number) => {
        const left = Math.max(0, 1 - (ms - shot.aimFromMs) / Math.max(1, endMs - shot.aimFromMs));
        const wobble = Math.sin(ms / 90 + slot) * 0.01 * left;
        return {
          yaw: twoDecimals(clampUnit(final.yaw + (slot % 2 === 0 ? -0.18 : 0.18) * left + wobble)),
          pitch: twoDecimals(clampUnit(final.pitch + 0.12 * left - wobble)),
        };
      };
      for (let ms = shot.aimFromMs + sampleMs; ms <= endMs; ms += sampleMs) {
        const point = aimAt(ms);
        pending.push({
          playerId: player.id,
          atMs: openAtMs + ms,
          input: aim(point.yaw, point.pitch),
        });
      }
      if (shot.shootMs !== null) {
        pending.push({
          playerId: player.id,
          atMs: openAtMs + shot.shootMs,
          input: shoot(
            volley,
            twoDecimals(clampUnit(final.yaw)),
            twoDecimals(clampUnit(final.pitch)),
            power,
          ),
        });
      }
    });
    pending.sort((a, b) => a.atMs - b.atMs);
  };

  const step = (): TargetRangeState => {
    const { state } = target;
    if (state.phase === "open" && plannedVolley !== volleyOf(state)) {
      plannedVolley = volleyOf(state);
      planVolley(state);
    }
    const nextMs = tickTimeMs(target.tick + 1);
    pending = pending.filter((entry) => {
      if (entry.atMs > nextMs + 1e-6) return true;
      target.input(entry.playerId, entry.input, entry.atMs);
      return false;
    });
    return target.step();
  };
  return { room: target, step };
}

/**
 * Bots for scene tests. Everyone aims from early in the volley, so all crosshairs are up together
 * around 2.5 s, then they shoot one after another from 2.8 s. Arrows land spread around the centre,
 * closer in later volleys. Seat 0 hits the bullseye in the first volley, seat 3 misses the target
 * in the second, seat 5 aims but never shoots in the second, and seat 7 always draws at half power.
 */
export const spreadBots: BotPlan = (volley, slot) => {
  if (volley % 3 === 2 && slot === 5) return { aimFromMs: 600, shootMs: null, dx: 0, dy: 0 };
  const shootMs = 2_800 + slot * 350;
  const aimFromMs = 200 + slot * 150;
  if (volley % 3 === 1 && slot === 0) return { aimFromMs, shootMs, dx: 0, dy: 0 };
  if (volley % 3 === 2 && slot === 3) return { aimFromMs, shootMs, dx: 70, dy: -20 };
  const angle = (slot * Math.PI) / 4 + volley * 0.7;
  const distance = 5 + ((volley + slot) % 4) * 4;
  return {
    aimFromMs,
    shootMs,
    dx: Math.round(Math.cos(angle) * distance),
    dy: Math.round(Math.sin(angle) * distance),
    power: slot === 7 ? 0.5 : 1,
  };
};
