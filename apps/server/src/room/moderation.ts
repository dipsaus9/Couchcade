import { closeCodes, type PlayerId, type RelayToHostMessage } from "@couchcade/protocol";
import type { PlayerRecord, RoomMeta, RoomStorage } from "./storage.ts";

/**
 * The host's moderation (docs/architecture/security.md, "Threats, defences and tests"): `room:kick` and
 * `room:lock`, and the check that keeps kicked and revoked players out when their socket connects.
 * Kick is the backstop for rude names and anyone the flood bucket doesn't catch.
 */

/** What the room needs to kick a player. */
export interface KickContext {
  storage: RoomStorage;
  /** Every open socket of the player, a second tab included. */
  socketsOf(id: PlayerId): Iterable<{ close(code: number, reason: string): void }>;
  sendToHost(message: RelayToHostMessage): void;
}

/** A close code and reason for a socket the room refuses. */
export interface Refusal {
  code: number;
  reason: string;
}

/**
 * Why the room refuses a phone before seating it, or null. `/rejoin` never calls the room, so the
 * room checks here: kicked closes with 4003, revoked (flooding) with 4008.
 */
export function refusalFor(record: PlayerRecord | null): Refusal | null {
  if (record?.kicked) return { code: closeCodes.kicked, reason: "Kicked" };
  if (record?.revoked) return { code: closeCodes.flooding, reason: "Flooding" };
  return null;
}

/**
 * `room:kick { id }`: one write marks the player kicked and frees their seat, the host hears
 * `player:left { reason: "kicked" }` once, and every socket of that player closes with 4003. A seat
 * that was already free (the player left, flooded or ran out their seat window) sends no
 * `player:left`, because the host already had one. Unknown ids and repeated kicks change nothing.
 */
export function kickPlayer(context: KickContext, id: PlayerId, now: number): void {
  const record = context.storage.readPlayer(id);
  if (!record || record.kicked) return;
  // Written before the sockets close, so their close handler sees the seat already gone.
  context.storage.kickPlayer(id, now);
  if (!record.released) context.sendToHost({ t: "player:left", d: { id, reason: "kicked" } });
  for (const socket of context.socketsOf(id)) socket.close(closeCodes.kicked, "Kicked");
}

/**
 * `room:lock { locked }`: new joins get 423 `room-locked` while the room is locked. Players who
 * already joined still rejoin. Writes only when the value changes.
 */
export function lockRoom(storage: RoomStorage, meta: RoomMeta, locked: boolean): void {
  if (meta.locked !== locked) storage.setLocked(locked);
}
