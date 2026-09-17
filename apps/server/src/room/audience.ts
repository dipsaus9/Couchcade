import { seatCount, type PlayerId, type RoomPhase } from "@couchcade/protocol";

/**
 * Audience and the room cap (docs/architecture/session-flow.md, "Late joiners and audience", and
 * docs/architecture/security.md decision 18). Phones past the 8 seats join as audience with
 * `slot: null`. A room holds at most 16 phones, and the longest-waiting audience member takes a
 * free seat, but never while a game runs.
 */

/** At most 16 phones per room: 8 players and 8 audience (owner, 2026-09-16). */
export const maxPhones = seatCount * 2;

/** A phone that has a place in the room: connected, or disconnected with its seat still held. */
export interface RoomMember {
  id: PlayerId;
}

/**
 * How many phones are in the room: every connected player id, plus every player who dropped and
 * still holds a place. A second tab of the same player counts once.
 */
export function memberCount(connected: Iterable<RoomMember>, held: Iterable<RoomMember>): number {
  const ids = new Set<PlayerId>();
  for (const { id } of connected) ids.add(id);
  for (const { id } of held) ids.add(id);
  return ids.size;
}

/** True when a phone that was never in the room must be refused: 16 phones are already in it. */
export function isRoomFull(members: number): boolean {
  return members >= maxPhones;
}

/** Seats go to audience members only outside a running game. */
export function promotesIn(phase: RoomPhase): boolean {
  return phase !== "playing";
}

/** An audience member waiting for a seat. */
export interface Waiting {
  id: PlayerId;
  joinedAt: number;
}

export interface Promotion {
  id: PlayerId;
  slot: number;
}

/**
 * Which audience member gets which free seat: the lowest `joinedAt` gets the lowest free slot, and
 * so on until the seats or the line run out. Ties on `joinedAt` go by id, so the result never
 * depends on connection order.
 */
export function planPromotions(
  taken: ReadonlySet<number>,
  waiting: readonly Waiting[],
): Promotion[] {
  const free: number[] = [];
  for (let slot = 0; slot < seatCount; slot++) if (!taken.has(slot)) free.push(slot);
  const line = waiting.toSorted((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  return line.slice(0, free.length).map(({ id }, index) => ({ id, slot: free[index]! }));
}
