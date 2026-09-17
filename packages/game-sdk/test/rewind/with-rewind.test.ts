import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { createRng } from "@couchcade/utils";
import { defineGame, tickMs, tickTimeMs } from "@couchcade/game-sdk/contract";
import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import { REWIND_HISTORY_MS, REWIND_MAX_MS, withRewind } from "@couchcade/game-sdk/rewind";
import type { Rewound, RewindOptions } from "@couchcade/game-sdk/rewind";
import { createFakeRoom, createPlayers, testGameContract } from "@couchcade/game-sdk/testing";

/**
 * A small real-time fixture: pucks slide along a track, slow down, bounce off its ends and off each
 * other. A push changes a puck's speed, so the tick a push lands in changes every later position,
 * and collisions carry that into the other pucks.
 */
const trackLength = 20;
const pushSpeed = 6;
const friction = 0.995;

const inputSchema = z.union([
  z.object({
    type: z.literal("push"),
    payload: z.object({ dir: z.union([z.literal(-1), z.literal(1)]) }),
  }),
  z.object({ type: z.literal("brake") }),
]);
type DashInput = z.infer<typeof inputSchema>;

interface Puck {
  x: number;
  v: number;
  /** The context of the last input this puck received. */
  lastAtMs: number | null;
  lastNowMs: number | null;
}

interface DashState {
  pucks: Record<string, Puck>;
  ticks: number;
}

const rules = {
  init(players: readonly Player[]): DashState {
    const gap = trackLength / (players.length + 1);
    return {
      pucks: Object.fromEntries(
        players.map((player, i) => [
          player.id,
          { x: gap * (i + 1), v: 0, lastAtMs: null, lastNowMs: null },
        ]),
      ),
      ticks: 0,
    };
  },

  onPlayerInput(state: DashState, player: Player, input: DashInput, ctx: InputContext): DashState {
    const puck = state.pucks[player.id];
    if (puck === undefined) return state;
    const v = input.type === "push" ? puck.v + input.payload.dir * pushSpeed : 0;
    return {
      ...state,
      pucks: {
        ...state.pucks,
        [player.id]: { ...puck, v, lastAtMs: ctx.atMs, lastNowMs: ctx.nowMs },
      },
    };
  },

  onTick(state: DashState, dtMs: number): DashState {
    const ids = Object.keys(state.pucks).toSorted();
    const pucks: Record<string, Puck> = {};
    for (const id of ids) {
      const puck = state.pucks[id] as Puck;
      let x = puck.x + (puck.v * dtMs) / 1000;
      let v = puck.v * friction;
      if (x < 0 || x > trackLength) {
        x = Math.min(trackLength, Math.max(0, x));
        v = 0 - v;
      }
      pucks[id] = { ...puck, x, v };
    }
    for (let i = 1; i < ids.length; i++) {
      const a = pucks[ids[i - 1] as string] as Puck;
      const b = pucks[ids[i] as string] as Puck;
      if (Math.abs(a.x - b.x) < 1 && a.v !== b.v) {
        pucks[ids[i - 1] as string] = { ...a, v: b.v };
        pucks[ids[i] as string] = { ...b, v: a.v };
      }
    }
    return { pucks, ticks: state.ticks + 1 };
  },

  onPlayerLeft(state: DashState, player: Player): DashState {
    const { [player.id]: _gone, ...pucks } = state.pucks;
    return { ...state, pucks };
  },
};

const noHostScene = () => Promise.reject(new Error("Fixture games have no host scene"));

function dashGame(options?: RewindOptions) {
  const rewind = withRewind<DashInput, DashState>(rules, options);
  return {
    rewind,
    game: defineGame({
      id: "rewind-dash",
      title: "Rewind dash",
      players: { min: 1, max: 4 },
      realtime: true,
      needsMotion: false,
      scene: "track",
      inputSchema,
      init: rewind.init,
      onPlayerInput: rewind.onPlayerInput,
      onTick: rewind.onTick,
      onPlayerLeft: rewind.onPlayerLeft,
      view: (state, player) => ({
        screen: "dash",
        data: { x: Math.round(rewind.unwrap(state).pucks[player.id]?.x ?? 0) },
      }),
      outcome: (state) =>
        rewind.unwrap(state).ticks < 60 * 60
          ? null
          : {
              placements: Object.keys(state.now.pucks).map((playerId) => ({ playerId, place: 1 })),
            },
      hostScene: noHostScene,
    }),
  };
}

/** The same game without the wrapper, as a game runs without rewind. */
const bareGame = defineGame({
  id: "rewind-dash",
  title: "Rewind dash",
  players: { min: 1, max: 4 },
  realtime: true,
  needsMotion: false,
  scene: "track",
  inputSchema,
  hostScene: noHostScene,
  init: rules.init,
  onPlayerInput: rules.onPlayerInput,
  onTick: rules.onTick,
  view: (state, player) => ({
    screen: "dash",
    data: { x: Math.round(state.pucks[player.id]?.x ?? 0) },
  }),
  outcome: () => null,
});

const [alice, bob] = createPlayers(2) as [Player, Player];
const push: DashInput = { type: "push", payload: { dir: 1 } };

/** Where the pucks are and go, without the context of their last input. */
const motion = (state: DashState) =>
  Object.values(state.pucks).map(({ x, v, lastNowMs }) => ({ x, v, lastNowMs }));

const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A room of the rewinding fixture game with two players. */
function room(options?: RewindOptions) {
  const { game, rewind } = dashGame(options);
  return { room: createFakeRoom(game, { players: [alice, bob], seed: 1 }), rewind };
}

describe("withRewind", () => {
  it("keeps 200 ms of history: the last 12 ticks, oldest first, without gaps", () => {
    const { room: dash } = room();
    dash.step(40);

    expect(REWIND_HISTORY_MS).toBe(200);
    expect(dash.state.tick).toBe(41);
    expect(dash.state.history.map((entry) => entry.tick)).toEqual([
      29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ]);
    expect(dash.state.history.length * tickMs).toBeCloseTo(200);
  });

  it("stores the state before each tick, so running a history entry again gives the next one", () => {
    const { room: dash } = room();
    dash.input(bob.id, push);
    dash.step(20);
    const [first, second] = dash.state.history as [
      Rewound<DashState>["history"][number],
      Rewound<DashState>["history"][number],
    ];

    let state = first.before;
    for (const { player, input, ctx } of first.inputs) {
      state = rules.onPlayerInput(state, player, input as DashInput, ctx);
    }
    expect(rules.onTick(state, tickMs)).toStrictEqual(second.before);
  });

  it("applies an on-time input in the tick it arrives in, without rewinding", () => {
    const { room: dash, rewind } = room();
    const bare = createFakeRoom(bareGame, { players: [alice, bob], seed: 1 });
    for (const r of [dash, bare]) {
      r.step(10);
      r.input(alice.id, push, tickTimeMs(11) - 4);
      r.step(30);
    }

    expect(rewind.unwrap(dash.state)).toStrictEqual(bare.state);
  });

  describe("late input gives the same final state as the same input on time", () => {
    const k = 30;
    const atMs = tickTimeMs(k) - 5; // the player acted during tick k

    it("for an input 5 ticks (83 ms) late", () => {
      const onTime = room();
      onTime.room.step(k - 1);
      onTime.room.input(alice.id, push, atMs);
      onTime.room.step(1);
      onTime.room.step(5);

      const late = room();
      late.room.step(k + 4);
      late.room.input(alice.id, push, atMs); // arrives for tick k + 5
      late.room.step(1);

      expect(late.room.tick).toBe(onTime.room.tick);
      expect(late.rewind.unwrap(late.room.state)).toStrictEqual(
        onTime.rewind.unwrap(onTime.room.state),
      );
      expect(late.rewind.unwrap(late.room.state).pucks[alice.id]?.lastNowMs).toBe(tickTimeMs(k));

      // They keep matching as the game goes on.
      onTime.room.step(120);
      late.room.step(120);
      expect(late.rewind.unwrap(late.room.state)).toStrictEqual(
        onTime.rewind.unwrap(onTime.room.state),
      );
    });

    it("while the same late input without the wrapper ends somewhere else", () => {
      const onTime = createFakeRoom(bareGame, { players: [alice, bob], seed: 1 });
      onTime.step(k - 1);
      onTime.input(alice.id, push, atMs);
      onTime.step(6);

      const late = createFakeRoom(bareGame, { players: [alice, bob], seed: 1 });
      late.step(k + 4);
      late.input(alice.id, push, atMs);
      late.step(1);

      expect(late.state.pucks[alice.id]?.x).not.toBe(onTime.state.pucks[alice.id]?.x);
    });

    it("for several late inputs from different ticks arriving in one frame", () => {
      const onTime = room();
      onTime.room.step(k - 1);
      onTime.room.input(alice.id, push, tickTimeMs(k));
      onTime.room.step(2); // alice at k
      onTime.room.input(bob.id, { type: "push", payload: { dir: -1 } }, tickTimeMs(k + 2) - 10);
      onTime.room.step(3); // bob at k + 2
      onTime.room.input(alice.id, { type: "brake" }, tickTimeMs(k + 5) - 1);
      onTime.room.step(1); // brake at k + 5
      expect(onTime.room.tick).toBe(k + 5);

      const late = room();
      late.room.step(k + 4);
      late.room.input(bob.id, { type: "push", payload: { dir: -1 } }, tickTimeMs(k + 2) - 10);
      late.room.input(alice.id, { type: "brake" }, tickTimeMs(k + 5) - 1);
      late.room.input(alice.id, push, tickTimeMs(k));
      late.room.step(1);

      expect(late.rewind.unwrap(late.room.state)).toStrictEqual(
        onTime.rewind.unwrap(onTime.room.state),
      );
    });

    it("for random matches with every input up to 150 ms late", () => {
      for (const seed of [1, 7, 2026]) {
        const rng = createRng(seed);
        const players = createPlayers(4);
        const events: Array<{ player: Player; input: DashInput; tick: number; delay: number }> = [];
        for (let tick = 5; tick < 600; tick += rng.int(1, 12)) {
          const player = players[rng.int(0, players.length - 1)] as Player;
          const input: DashInput =
            rng.int(0, 4) === 0
              ? { type: "brake" }
              : { type: "push", payload: { dir: rng.int(0, 1) === 0 ? -1 : 1 } };
          events.push({ player, input, tick, delay: rng.int(0, 9) });
        }

        const play = (delayed: boolean) => {
          const { game, rewind } = dashGame();
          const r = createFakeRoom(game, { players, seed });
          for (let tick = 1; tick <= 620; tick++) {
            for (const event of events) {
              if (event.tick + (delayed ? event.delay : 0) === tick) {
                r.input(event.player.id, event.input, tickTimeMs(event.tick) - 3);
              }
            }
            r.step(1);
          }
          return rewind.unwrap(r.state);
        };

        expect(play(true), `seed ${seed}`).toStrictEqual(play(false));
      }
    });
  });

  describe("caps the rewind at 150 ms", () => {
    it("applies an input older than 150 ms at the oldest tick it can reach, 9 ticks back", () => {
      const { room: dash, rewind } = room();
      dash.step(50);
      dash.input(alice.id, push, tickTimeMs(25)); // 26 ticks late
      dash.step(1);

      expect(REWIND_MAX_MS).toBe(150);
      const puck = rewind.unwrap(dash.state).pucks[alice.id];
      expect(puck?.lastNowMs).toBe(tickTimeMs(51 - 9));
      expect(puck?.lastAtMs).toBe(tickTimeMs(25));
    });

    it("moves the game like that input on time 150 ms before it arrived", () => {
      const capped = room();
      capped.room.step(50);
      capped.room.input(alice.id, push, tickTimeMs(25));
      capped.room.step(1);

      const onTime = room();
      onTime.room.step(41);
      onTime.room.input(alice.id, push, tickTimeMs(42));
      onTime.room.step(10);

      expect(motion(capped.rewind.unwrap(capped.room.state))).toStrictEqual(
        motion(onTime.rewind.unwrap(onTime.room.state)),
      );
    });

    it("never reaches past the start of the game", () => {
      const { room: dash, rewind } = room();
      dash.step(3);
      dash.input(alice.id, push, -500);
      dash.step(1);

      expect(rewind.unwrap(dash.state).pucks[alice.id]?.lastNowMs).toBe(tickTimeMs(1));
    });

    it("applies an input stamped in the future at the next tick", () => {
      const { rewind } = dashGame();
      let state = rewind.init([alice, bob], 1);
      for (let i = 0; i < 10; i++) state = rewind.onTick(state, tickMs);
      state = rewind.onPlayerInput(state, alice, push, {
        atMs: tickTimeMs(40),
        nowMs: tickTimeMs(11),
        displayLagMs: 0,
      });

      expect(state.pending).toHaveLength(1);
      expect(state.pending[0]?.ctx.nowMs).toBe(tickTimeMs(11));
      expect(state.dirtyFrom).toBeNull();
    });

    it("re-runs at most 10 onTick calls for a rewind", () => {
      let calls = 0;
      const counted = withRewind<DashInput, DashState>({
        ...rules,
        onTick: (state, dtMs) => {
          calls += 1;
          return rules.onTick(state, dtMs);
        },
      });
      let state = counted.init([alice, bob], 1);
      for (let i = 0; i < 30; i++) state = counted.onTick(state, tickMs);
      state = counted.onPlayerInput(state, alice, push, {
        atMs: 0,
        nowMs: tickTimeMs(31),
        displayLagMs: 0,
      });
      state = counted.onPlayerInput(state, bob, push, {
        atMs: tickTimeMs(28),
        nowMs: tickTimeMs(31),
        displayLagMs: 0,
      });

      calls = 0;
      state = counted.onTick(state, tickMs);
      expect(calls).toBe(10);
      calls = 0;
      counted.onTick(state, tickMs);
      expect(calls).toBe(1);
    });
  });

  describe("display lag", () => {
    const lagged = (subtractDisplayLag: boolean) => {
      const { game, rewind } = dashGame({ subtractDisplayLag });
      const dash = createFakeRoom(game, { players: [alice, bob], seed: 1, displayLagMs: 50 });
      dash.step(40);
      dash.input(alice.id, push, tickTimeMs(38));
      dash.step(1);
      return rewind.unwrap(dash.state).pucks[alice.id];
    };

    it("is ignored by default: the tick comes from atMs alone", () => {
      expect(lagged(false)?.lastNowMs).toBe(tickTimeMs(38));
    });

    it("is subtracted from atMs with subtractDisplayLag, still within the 150 ms cap", () => {
      expect(lagged(true)?.lastNowMs).toBe(tickTimeMs(35));

      const { game, rewind } = dashGame({ subtractDisplayLag: true });
      const dash = createFakeRoom(game, { players: [alice, bob], seed: 1, displayLagMs: 400 });
      dash.step(40);
      dash.input(alice.id, push, tickTimeMs(40));
      dash.step(1);
      expect(rewind.unwrap(dash.state).pucks[alice.id]?.lastNowMs).toBe(tickTimeMs(41 - 9));
    });
  });

  describe("player leaves", () => {
    it("are not undone by a later rewind to before the leave", () => {
      const { room: dash, rewind } = room();
      dash.step(40);
      dash.leave(bob.id);
      dash.step(2);
      dash.input(alice.id, push, tickTimeMs(38)); // acted before bob left
      dash.step(1);

      expect(rewind.unwrap(dash.state).pucks).not.toHaveProperty(bob.id);
      expect(rewind.unwrap(dash.state).pucks[alice.id]?.lastNowMs).toBe(tickTimeMs(41));
    });

    it("keep the late inputs that arrived before the leave", () => {
      const { rewind } = dashGame();
      let late = rewind.init([alice, bob], 1);
      for (let i = 0; i < 40; i++) late = rewind.onTick(late, tickMs);
      late = rewind.onPlayerInput(late, alice, push, {
        atMs: tickTimeMs(36),
        nowMs: tickTimeMs(41),
        displayLagMs: 0,
      });
      late = rewind.onPlayerLeft(late, bob);

      let onTime = rewind.init([alice, bob], 1);
      for (let i = 0; i < 35; i++) onTime = rewind.onTick(onTime, tickMs);
      onTime = rewind.onPlayerInput(onTime, alice, push, {
        atMs: tickTimeMs(36),
        nowMs: tickTimeMs(36),
        displayLagMs: 0,
      });
      for (let i = 0; i < 5; i++) onTime = rewind.onTick(onTime, tickMs);
      onTime = rewind.onPlayerLeft(onTime, bob);

      expect(late.history).toEqual([]);
      expect(rewind.unwrap(late)).toStrictEqual(rewind.unwrap(onTime));
    });

    it("change nothing for a game without onPlayerLeft", () => {
      const { onPlayerLeft: _left, ...withoutLeave } = rules;
      const rewind = withRewind<DashInput, DashState>(withoutLeave);
      let state = rewind.init([alice, bob], 1);
      state = rewind.onTick(state, tickMs);
      expect(rewind.onPlayerLeft(state, bob)).toBe(state);
    });
  });

  it("keeps plain JSON state: a JSON round trip before every call changes nothing", () => {
    const { rewind } = dashGame();
    let state = rewind.init([alice, bob], 1);
    let copied = state;
    for (let tick = 1; tick <= 90; tick++) {
      if (tick % 5 === 0) {
        const ctx = { atMs: tickTimeMs(tick - 3), nowMs: tickTimeMs(tick), displayLagMs: 0 };
        state = rewind.onPlayerInput(state, alice, push, ctx);
        copied = rewind.onPlayerInput(roundTrip(copied), alice, push, ctx);
      }
      state = rewind.onTick(state, tickMs);
      copied = rewind.onTick(roundTrip(copied), tickMs);
    }
    expect(roundTrip(state)).toStrictEqual(state);
    expect(copied).toStrictEqual(state);
  });

  it("does not change its arguments", () => {
    const { rewind } = dashGame();
    let state = rewind.init([alice, bob], 1);
    for (let i = 0; i < 20; i++) state = rewind.onTick(state, tickMs);
    const snapshot = structuredClone(state);

    const late = rewind.onPlayerInput(state, alice, push, {
      atMs: tickTimeMs(15),
      nowMs: tickTimeMs(21),
      displayLagMs: 0,
    });
    expect(state).toStrictEqual(snapshot);
    const lateCopy = structuredClone(late);
    rewind.onTick(late, tickMs);
    expect(late).toStrictEqual(lateCopy);
  });

  it("wraps a restored state with an empty history, and unwraps to the game state", () => {
    const { rewind } = dashGame();
    const restored = rules.init([alice, bob]);
    const wrapped = rewind.wrap(restored);

    expect(wrapped).toStrictEqual({
      now: restored,
      tick: 1,
      pending: [],
      history: [],
      dirtyFrom: null,
      seq: 0,
    });
    expect(rewind.unwrap(wrapped)).toBe(restored);
  });

  it("rejects a history shorter than one tick and a negative rewind", () => {
    expect(() => withRewind(rules, { historyMs: 0 })).toThrow(RangeError);
    expect(() => withRewind(rules, { maxRewindMs: -1 })).toThrow(RangeError);
  });
});

// The game contract is unchanged: a wrapped game passes the contract test kit.
testGameContract(dashGame().game, { folder: "rewind-dash", ticks: 300, seeds: [1] });
