import type * as z from "zod/mini";
import type { hostToRelay, phoneToRelay, relayToHost, relayToPhone } from "../src/index.ts";

/** One valid and one invalid example per message type. The mapped type forces a fixture for every type. */
type Fixtures<C extends Record<string, z.ZodMiniType>> = {
  [K in keyof C]: { valid: z.input<C[K]>; invalid: unknown };
};

const alice = "ABCDEFGH";
const bob = "JKLMNPQR";
const profile = { skin: 2, hair: 7, hairColour: 5 };
const player = {
  id: alice,
  name: "Alice",
  slot: 0,
  profile,
  joinedAt: 1_789_000_000_000,
  connected: true,
};
const view = { screen: "lobby", data: { ready: false }, cue: "press" } as const;

export const hostToRelayFixtures: Fixtures<typeof hostToRelay> = {
  "controller:state": {
    valid: {
      t: "controller:state",
      d: {
        gameId: "quick-draw",
        views: [
          { to: "players", view },
          { to: [alice, bob], view: { screen: "draw", data: null } },
        ],
      },
    },
    invalid: { t: "controller:state", d: { gameId: "Quick Draw", views: [] } },
  },
  "room:kick": {
    valid: { t: "room:kick", d: { id: alice } },
    invalid: { t: "room:kick", d: { id: "host" } },
  },
  "room:lock": {
    valid: { t: "room:lock", d: { locked: true } },
    invalid: { t: "room:lock", d: { locked: "yes" } },
  },
  "room:phase": {
    valid: { t: "room:phase", d: { phase: "motion-check" } },
    invalid: { t: "room:phase", d: { phase: "paused" } },
  },
  "room:snapshot": {
    valid: { t: "room:snapshot", d: { round: 3, gameId: null, data: { scores: [1, 2] } } },
    invalid: { t: "room:snapshot", d: { round: -1, gameId: null, data: {} } },
  },
  "room:end": {
    valid: { t: "room:end", d: {} },
    invalid: { t: "room:end" },
  },
  "clock:ping": {
    valid: { t: "clock:ping", d: { id: 0, t0: 1_789_000_000_000.25 } },
    invalid: { t: "clock:ping", d: { id: 1.5, t0: 1 } },
  },
};

export const phoneToRelayFixtures: Fixtures<typeof phoneToRelay> = {
  input: {
    valid: { t: "input", d: { type: "draw", payload: { power: 0.8 }, at: 1_789_000_000_123 } },
    invalid: { t: "input", d: { type: "draw", at: 12.5 } },
  },
  "ui:action": {
    valid: { t: "ui:action", d: { action: "pick-game", value: "quick-draw" } },
    invalid: { t: "ui:action", d: { action: "restart" } },
  },
  "calibration:tap": {
    valid: { t: "calibration:tap", d: { at: 1_789_000_000_500 } },
    invalid: { t: "calibration:tap", d: {} },
  },
  "motion:status": {
    valid: { t: "motion:status", d: { status: "unsupported" } },
    invalid: { t: "motion:status", d: { status: "maybe" } },
  },
  "player:profile": {
    valid: { t: "player:profile", d: { profile } },
    invalid: { t: "player:profile", d: { profile: { skin: 6, hair: 0, hairColour: 0 } } },
  },
  "player:leave": {
    valid: { t: "player:leave", d: {} },
    invalid: { t: "player:leave", d: null },
  },
  "clock:ping": {
    valid: { t: "clock:ping", d: { id: 4, t0: 812.5 } },
    invalid: { t: "clock:ping", d: { id: 4 } },
  },
};

export const relayToHostFixtures: Fixtures<typeof relayToHost> = {
  "room:welcome": {
    valid: { t: "room:welcome", d: { role: "host", code: "ABCD", phase: "lobby", locked: false } },
    invalid: {
      t: "room:welcome",
      d: { role: "host", code: "ABCI", phase: "lobby", locked: false },
    },
  },
  "player:joined": {
    valid: { t: "player:joined", d: { player } },
    invalid: { t: "player:joined", d: { player: { ...player, name: "" } } },
  },
  "player:left": {
    valid: { t: "player:left", d: { id: alice, reason: "disconnected" } },
    invalid: { t: "player:left", d: { id: alice, reason: "timeout" } },
  },
  "player:reconnected": {
    valid: { t: "player:reconnected", d: { id: bob } },
    invalid: { t: "player:reconnected", d: { id: "abcdefgh" } },
  },
  "player:promoted": {
    valid: { t: "player:promoted", d: { id: bob, slot: 7 } },
    invalid: { t: "player:promoted", d: { id: bob, slot: 8 } },
  },
  "player:profile": {
    valid: { t: "player:profile", d: { profile }, from: alice },
    invalid: { t: "player:profile", d: { profile } },
  },
  input: {
    valid: { t: "input", d: { type: "fire", at: 1_789_000_000_123 }, from: bob },
    invalid: { t: "input", d: { type: "", at: 1_789_000_000_123 }, from: bob },
  },
  "ui:action": {
    valid: { t: "ui:action", d: { action: "start" }, from: alice },
    invalid: { t: "ui:action", d: { action: "start" }, from: "host" },
  },
  "calibration:tap": {
    valid: { t: "calibration:tap", d: { at: 1_789_000_000_900 }, from: alice },
    invalid: { t: "calibration:tap", d: { at: -5 }, from: alice },
  },
  "motion:status": {
    valid: { t: "motion:status", d: { status: "granted" }, from: bob },
    invalid: { t: "motion:status", d: { status: true }, from: bob },
  },
  "room:snapshot": {
    valid: { t: "room:snapshot", d: { round: 0, gameId: "quick-draw", data: [1, "a", null] } },
    invalid: { t: "room:snapshot", d: { round: 1, gameId: "quick-draw" } },
  },
  "clock:pong": {
    valid: { t: "clock:pong", d: { id: 4, t0: 812.5, t1: 1_789_000_000_000 } },
    invalid: { t: "clock:pong", d: { id: 4, t0: 812.5, t1: 1.5 } },
  },
};

export const relayToPhoneFixtures: Fixtures<typeof relayToPhone> = {
  "room:welcome": {
    valid: {
      t: "room:welcome",
      d: { role: "audience", code: "WXYZ", phase: "playing", you: { ...player, slot: null } },
    },
    invalid: {
      t: "room:welcome",
      d: { role: "host", code: "WXYZ", phase: "playing", you: player },
    },
  },
  "room:host": {
    valid: { t: "room:host", d: { connected: false } },
    invalid: { t: "room:host", d: {} },
  },
  "controller:state": {
    valid: { t: "controller:state", d: { gameId: null, view: { screen: "next-game", data: {} } } },
    invalid: { t: "controller:state", d: { gameId: null, views: [{ to: "all", view }] } },
  },
  "player:promoted": {
    valid: { t: "player:promoted", d: { id: alice, slot: 3 } },
    invalid: { t: "player:promoted", d: { id: alice, slot: null } },
  },
  "clock:pong": {
    valid: { t: "clock:pong", d: { id: 0, t0: 1, t1: 2 } },
    invalid: { t: "clock:pong", d: { id: 0, t1: 2 } },
  },
};
