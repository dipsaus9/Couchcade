/**
 * The seat window for phones that drop (docs/architecture/platform.md, "Reconnects", and
 * docs/architecture/session-flow.md, "Phone reconnect"). A phone whose socket closes keeps its
 * seat, colour and score for 2 minutes. Back in time, it gets the same seat. Later, the seat is
 * released and the rejoin closes with 4011.
 */

/** How long a disconnected player's seat stays reserved. */
export const seatWindowMs = 2 * 60_000;

/** What the room knows about a player id from storage. */
export interface SeatRecord {
  /** Room time the player's socket closed, or null while they are connected. */
  leftAt: number | null;
  /** True once the seat was given up: the player left, or the seat window ran out. */
  released: boolean;
}

/**
 * How a connecting player id relates to the room:
 * - `new`: the room has never seen it.
 * - `returning`: seen before and still seated (disconnected inside the window, or a second tab).
 * - `expired`: its seat was released. The socket closes with 4011.
 *
 * CC-2.5 (revoked) and CC-2.6 (kicked) refuse a player before this check, with 4008 and 4003.
 */
export type Arrival = "new" | "returning" | "expired";

export function arrivalOf(record: SeatRecord | null, now: number): Arrival {
  if (record === null) return "new";
  if (record.released) return "expired";
  if (record.leftAt !== null && isSeatDue(record.leftAt, now)) return "expired";
  return "returning";
}

/** Room time at which the seat of a player who disconnected at `leftAt` is released. */
export function seatExpiresAt(leftAt: number): number {
  return leftAt + seatWindowMs;
}

/** True when the seat of a player who disconnected at `leftAt` should be released by `now`. */
export function isSeatDue(leftAt: number, now: number): boolean {
  return seatExpiresAt(leftAt) <= now;
}
