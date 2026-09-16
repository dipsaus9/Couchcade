/**
 * A test-only game and helpers for the runtime tests, so they don't depend on any real game in
 * `games/`. The game logs every input and tick in order, echoes what players say into their views,
 * and ends when a player sends `end`.
 */
import { defineGame, type Outcome, type Player } from "@couchcade/game-sdk/contract";
import { createPlayers } from "@couchcade/game-sdk/testing";
import type { RelayToHostMessage } from "@couchcade/protocol";
import * as z from "zod/mini";
import type { LobbyState } from "../../src/screens/lobby/lobby-state.ts";
import type { Scheduler } from "../../src/runtime/timing.ts";

export const echoInputSchema = z.union([
  z.object({ type: z.literal("say"), payload: z.object({ text: z.string() }) }),
  z.object({ type: z.literal("end") }),
]);

export interface EchoState {
  players: string[];
  seed: number;
  ticks: number;
  /** Everything that happened, in order: `tick`, or `<id>:<type>@<atMs>/<nowMs>`. */
  log: string[];
  said: Record<string, string>;
  ended: boolean;
}

/**
 * With `leaves`, the game has `onPlayerLeft`: it logs `<id>:left` and ends once fewer than 2
 * players are still in, like Quick Draw.
 */
export function echoGame({ id = "echo", realtime = true, min = 1, max = 8, leaves = false } = {}) {
  const game = defineGame({
    id,
    title: "Echo",
    players: { min, max },
    realtime,
    needsMotion: false,
    scene: "desert",
    inputSchema: echoInputSchema,

    init: (players: readonly Player[], seed: number): EchoState => ({
      players: players.map((player) => player.id),
      seed,
      ticks: 0,
      log: [],
      said: {},
      ended: false,
    }),

    onPlayerInput(state, player, input, ctx) {
      const log = [...state.log, `${player.id}:${input.type}@${ctx.atMs}/${ctx.nowMs}`];
      if (input.type === "end") return { ...state, log, ended: true };
      return { ...state, log, said: { ...state.said, [player.id]: input.payload.text } };
    },

    onTick: (state) => ({ ...state, ticks: state.ticks + 1, log: [...state.log, "tick"] }),

    view: (state, player) => ({ screen: "echo", data: { text: state.said[player.id] ?? "" } }),

    outcome(state): Outcome | null {
      if (!state.ended) return null;
      return { placements: state.players.map((playerId) => ({ playerId, place: 1 })) };
    },

    hostScene: () => Promise.reject(new Error("Test games have no host scene")),
  });
  if (!leaves) return game;
  return defineGame({
    ...game,
    onPlayerLeft(state: EchoState, player: Player): EchoState {
      const log = [...state.log, `${player.id}:left`];
      const gone = log.filter((entry) => entry.endsWith(":left")).length;
      return { ...state, log, ended: state.players.length - gone < 2 };
    },
  });
}

/** A lobby with `count` seated, connected players. The first one is the VIP. */
export function lobbyWith(count: number): LobbyState {
  return { code: "BEAN", phase: "lobby", locked: false, players: createPlayers(count) };
}

export function inputMessage(
  from: string,
  d: { type: string; payload?: unknown; at?: number },
): RelayToHostMessage {
  return { t: "input", from, d: { at: 0, ...d } } as RelayToHostMessage;
}

export function startAction(from: string): RelayToHostMessage {
  return { t: "ui:action", from, d: { action: "start" } };
}

/** `pick-game` for `gameId`, or "Surprise me" without one. */
export function pickAction(from: string, gameId?: string): RelayToHostMessage {
  const d =
    gameId === undefined
      ? { action: "pick-game" as const }
      : { action: "pick-game" as const, value: gameId };
  return { t: "ui:action", from, d };
}

export function backAction(from: string): RelayToHostMessage {
  return { t: "ui:action", from, d: { action: "back-to-menu" } };
}

export function playAgainAction(from: string): RelayToHostMessage {
  return { t: "ui:action", from, d: { action: "play-again" } };
}

/** Virtual time: a clock and a scheduler that only move when a test advances them. */
export function createVirtualTime(start = 0) {
  let now = start;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();

  const schedule: Scheduler = (callback, delayMs) => {
    const id = nextId++;
    timers.set(id, { at: now + delayMs, callback });
    return () => timers.delete(id);
  };

  return {
    now: () => now,
    schedule,
    get pending() {
      return timers.size;
    },
    /** Moves time forward by `ms`, firing every timer due on the way, in time order. */
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        let due: [number, { at: number; callback: () => void }] | undefined;
        for (const entry of timers) {
          if (entry[1].at <= end && (due === undefined || entry[1].at < due[1].at)) due = entry;
        }
        if (due === undefined) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].callback();
      }
      now = end;
    },
  };
}
