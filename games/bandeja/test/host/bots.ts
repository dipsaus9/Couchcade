import { createFakeRoom, createPlayers } from "@couchcade/game-sdk/testing";
import { tickTimeMs } from "@couchcade/game-sdk/contract";
import type { FakeRoom } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import type { Rewound } from "@couchcade/game-sdk/rewind";
import game from "../../src/index.ts";
import type { BandejaInput, BandejaState, BandejaView, SlotName } from "../../src/shared/index.ts";

/**
 * Bots that keep a Bandeja match moving for the TV scene's boot test: on each slot's arrival
 * moment they either swing dead on time (a clean hit, straight back down the middle) or let it
 * go, so rallies end by a double bounce every so often instead of always running to the shot-60
 * safety valve. `plan` is a pure function of the point, slot and shot count, so the whole match
 * (and its render) is reproducible.
 */

export type BandejaRoom = FakeRoom<BandejaInput, Rewound<BandejaState, BandejaInput>, BandejaView>;

const names = ["Noor", "Sam", "Kim", "Alex"];

/** `count` players with short real names, so screenshots and name layouts look like a real room. */
export function namedPlayers(count: number): Player[] {
  return createPlayers(count).map((player, index) => ({
    ...player,
    name: names[index] ?? player.name,
  }));
}

/** Whether the bot at `slot` swings this shot (true most of the time, so points still happen). */
export type BotPlan = (point: number, slot: SlotName, shots: number) => boolean;

/** Everyone swings clean and dead on time, except roughly one shot in four, which lets the ball
 * through so rallies end by a double bounce instead of always running to the squeeze. */
export const alwaysSwing: BotPlan = () => true;

export const spreadBots: BotPlan = (point, slot, shots) => {
  const key = point * 7 + slot.length * 3 + shots;
  return key % 4 !== 0;
};

/**
 * A room whose bots swing per `plan`. Call `step()` once per frame: right as the upcoming tick
 * reaches a slot's arrival moment, it queues that slot's swing (or not, per `plan`) for the tick,
 * then runs it -- like the host runtime does between two TV frames. Planning a shot the instant
 * its arrival first appears (rather than waiting for `nowMs` to reach it) would stamp `atMs` far
 * in the future and apply it immediately, well before the ball got there, so this waits.
 */
export function botRoom(
  players: number | readonly Player[],
  seed: number,
  plan: BotPlan,
): { room: BandejaRoom; step: () => Rewound<BandejaState, BandejaInput> } {
  const target: BandejaRoom = createFakeRoom(game, {
    players: typeof players === "number" ? namedPlayers(players) : players,
    seed,
  });
  const planned = new Set<string>();

  const step = (): Rewound<BandejaState, BandejaInput> => {
    const state = target.state.now;
    const ball = state.ball;
    const nextMs = tickTimeMs(target.tick + 1);
    if (ball !== null) {
      for (const player of state.players) {
        if (player.left) continue;
        const arriveAt = ball.leg.arrivals[player.slot];
        if (arriveAt === undefined || ball.leg.timedOut.includes(player.slot)) continue;
        if (arriveAt > nextMs) continue;
        const key = `${state.point}:${player.slot}:${arriveAt}`;
        if (planned.has(key)) continue;
        planned.add(key);
        if (!plan(state.point, player.slot, state.rally?.shots ?? 0)) continue;
        target.input(
          player.id,
          { type: "swing", payload: { point: state.point, speed: 1, angle: 0 } },
          arriveAt,
        );
      }
    }
    return target.step();
  };
  return { room: target, step };
}
