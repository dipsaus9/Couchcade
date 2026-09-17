import type { PlayerId } from "@couchcade/protocol";

/**
 * WebRTC signalling relay (docs/architecture/realtime-link.md, "What the room does" and "Security
 * and privacy"). The room only introduces a seated player and the host:
 *
 * - `rtc:offer` from a player with a seat goes to the host with `from`, exactly like `input` and
 *   the other forwarded messages (senders and the catalogue in `@couchcade/protocol` already keep
 *   audience and host sockets from sending it, and only a `player` socket ever reaches `#onPhoneMessage`
 *   with the role that lets it through).
 * - `rtc:answer` from the host goes to the connected phone named in `to`, with `to` removed. An
 *   unknown or disconnected `to` is dropped, which `answerTarget` below decides.
 *
 * The room never parses `desc` beyond the protocol schema, never stores it and never logs it: this
 * module carries no storage access at all.
 */

/**
 * The connected phone `to` names, or null when nobody with that id is connected right now (an
 * unknown player, or one who disconnected between the offer and the answer). The relay drops the
 * answer in that case instead of guessing where it should go.
 */
export function answerTarget<T>(
  phones: Iterable<T>,
  idOf: (phone: T) => PlayerId,
  to: PlayerId,
): T | null {
  for (const phone of phones) {
    if (idOf(phone) === to) return phone;
  }
  return null;
}
