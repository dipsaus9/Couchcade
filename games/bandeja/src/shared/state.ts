import { createRng } from "@couchcade/utils";
import type { Player } from "@couchcade/game-sdk/contract";
import type { BodyState } from "@couchcade/physics";
import { awayAfterMisses, seatOrderByCount, slotSpecByName, slotsForCount } from "./constants.ts";
import type { Side, SlotName, SlotSpec } from "./constants.ts";

/**
 * Point flow (docs/games/bandeja.md, "Point flow and timings"): `intro` -> `serve` -> `rally` ->
 * `pointEnd` -> `serve` (both sides under target) or `over` (a side reached target, or the clock
 * ran out). `serve` and `rally` share the same physics: `serve` is a fixed 900 ms label before the
 * ball is live for swinging (the mermaid's "the serve leaves the racket"), `rally` runs until the
 * point ends.
 */
export type Phase = "intro" | "serve" | "rally" | "pointEnd" | "over";

/** A rally-ending reason (docs/games/bandeja.md, "Losing a point" and rule 9's safety valve). */
export type PointReason = "net" | "double-bounce" | "squeeze";

export interface BandejaPlayer {
  id: string;
  name: string;
  side: Side;
  slot: SlotName;
  /** The seat expired (`onPlayerLeft`): the slot auto-returns for the rest of the match. */
  left: boolean;
  /** Consecutive arrival moments that timed out with no swing within 240 ms. `>= awayAfterMisses`
   * is away (rule 10); any accepted swing resets this to 0 at once. */
  missStreak: number;
}

/** Arrival moments for the shot now in flight, recomputed by `predict` on every path change. */
export interface BallLeg {
  arrivals: Partial<Record<SlotName, number>>;
  /** Slots whose arrival already timed out (recorded as a miss) for this leg. */
  timedOut: SlotName[];
}

/** The ball: `body` is the Planck plan view, `z`/`vz` are plain ballistic arithmetic. */
export interface BallState {
  body: BodyState;
  z: number;
  vz: number;
  leg: BallLeg;
}

export interface RallyState {
  /** Shots played this rally so far; the serve is shot 1 (rule 9, the squeeze). */
  shots: number;
  /** Consecutive floor bounces on `bounceSide` without an intervening hit. */
  bounces: number;
  bounceSide: Side | null;
  /** Set once the second bounce lands; the point is awarded at this game time unless a swing
   * connects first (Fairness rule 3). */
  pointSettleAtMs: number | null;
}

export interface LastPoint {
  won: Side;
  reason: PointReason;
}

export interface BandejaState {
  phase: Phase;
  /** Game time of the latest tick. */
  nowMs: number;
  /** Game time the current phase started. */
  phaseAtMs: number;
  /** Counts points from 1 for the whole match (input message schema). */
  point: number;
  scores: Record<Side, number>;
  /** The side serving the point now in play (or about to be). */
  serving: Side;
  /** The last slot each side served from, so the serve alternates within a side (rule 4). */
  lastServeSlot: Record<Side, SlotName | null>;
  players: BandejaPlayer[];
  /** Set during `serve` and `rally`, null otherwise. */
  ball: BallState | null;
  /** Set during `serve` and `rally`, null otherwise. */
  rally: RallyState | null;
  /** The point just finished, null before point 1. */
  lastPoint: LastPoint | null;
  /** Seeded RNG state: the only randomness in the game is the serve's aim jitter. */
  rng: number;
}

export function otherSide(side: Side): Side {
  return side === "a" ? "b" : "a";
}

/** Side A defends `y < 10`, side B defends `y > 10` (Court, ball and walls, "The plan view"). */
export function sideOfY(y: number): Side {
  return y < 10 ? "a" : "b";
}

export function findPlayer(state: BandejaState, id: string | null): BandejaPlayer | undefined {
  return id === null ? undefined : state.players.find((player) => player.id === id);
}

export function findPlayerBySlot(state: BandejaState, slot: SlotName): BandejaPlayer | undefined {
  return state.players.find((player) => player.slot === slot);
}

export function findPlayerSlot(
  state: BandejaState,
  id: string,
): { player: BandejaPlayer; slot: SlotName } | undefined {
  const player = findPlayer(state, id);
  return player === undefined ? undefined : { player, slot: player.slot };
}

/** The slots this match uses at all (occupied or the one auto-returning empty slot at 3). */
export function matchSlots(state: BandejaState): readonly SlotName[] {
  const count = state.players.length;
  return slotsForCount(count === 2 ? 2 : 4);
}

export function slotSpec(slot: SlotName): SlotSpec {
  const spec = slotSpecByName.get(slot);
  if (spec === undefined) throw new RangeError(`Unknown slot ${slot}`);
  return spec;
}

/** `matchSlots`, as full specs: what `predict` looks ahead for (Look-ahead). */
export function matchSlotSpecs(state: BandejaState): readonly SlotSpec[] {
  return matchSlots(state).map(slotSpec);
}

/** A slot auto-returns: nobody was ever seated there, they left, or they're away (rule 10). */
export function isAutoSlot(state: BandejaState, slot: SlotName): boolean {
  const player = findPlayerBySlot(state, slot);
  return player === undefined || player.left || player.missStreak >= awayAfterMisses;
}

/** Active (not left) players, in seat order. */
export function activePlayers(state: BandejaState): BandejaPlayer[] {
  return state.players.filter((player) => !player.left);
}

/** True once every player on `side` has left (rule 13, "if a whole side empties"). */
export function sideEmpty(state: BandejaState, side: Side): boolean {
  const onSide = state.players.filter((player) => player.side === side);
  return onSide.length > 0 && onSide.every((player) => player.left);
}

/** A new match: `intro` starts at game time 0, side A serves point 1 (rule 4). */
export function init(players: readonly Player[], seed: number): BandejaState {
  const count = players.length === 2 ? 2 : players.length === 3 ? 3 : 4;
  const seats = seatOrderByCount[count];
  const bandejaPlayers: BandejaPlayer[] = players.map((player, index) => {
    const slot = seats[index] as SlotName;
    return {
      id: player.id,
      name: player.name,
      side: slotSpec(slot).side,
      slot,
      left: false,
      missStreak: 0,
    };
  });
  return {
    phase: "intro",
    nowMs: 0,
    phaseAtMs: 0,
    point: 1,
    scores: { a: 0, b: 0 },
    serving: "a",
    lastServeSlot: { a: null, b: null },
    players: bandejaPlayers,
    ball: null,
    rally: null,
    lastPoint: null,
    rng: createRng(seed).state,
  };
}
