import { playerIdSchema, playerNameSchema, type PlayerId } from "@couchcade/protocol";

/**
 * Who a socket belongs to, taken from a verified ticket. The Worker sets it as `x-cc-*` headers on
 * the upgrade it forwards, and the room trusts those headers because it isn't reachable from the
 * internet. See docs/architecture/platform.md, "Worker routing".
 */
export type SocketIdentity =
  | { role: "host" }
  | { role: "player"; playerId: PlayerId; name: string };

export const identityHeaders = {
  role: "x-cc-role",
  playerId: "x-cc-player-id",
  /** Percent-encoded, because header values can't carry non-ASCII names. */
  name: "x-cc-name",
} as const;

/** The host's player id is always this fixed value. */
export const hostPlayerId = "host";

/** Header prefixes a client may never set on a request that reaches a room. */
const reservedHeaderPrefixes = ["x-cc-", "x-partykit-"];

/**
 * Copies the upgrade headers for the room: drops every reserved header a client sent, then sets
 * the identity headers from the verified ticket.
 */
export function forwardHeaders(source: Headers, identity: SocketIdentity): Headers {
  const headers = new Headers();
  for (const [key, value] of source) {
    if (!reservedHeaderPrefixes.some((prefix) => key.toLowerCase().startsWith(prefix))) {
      headers.append(key, value);
    }
  }
  headers.set(identityHeaders.role, identity.role);
  if (identity.role === "host") {
    headers.set(identityHeaders.playerId, hostPlayerId);
  } else {
    headers.set(identityHeaders.playerId, identity.playerId);
    headers.set(identityHeaders.name, encodeURIComponent(identity.name));
  }
  return headers;
}

/** Reads the identity headers the Worker set. Returns null when they are missing or invalid. */
export function readIdentity(headers: Headers): SocketIdentity | null {
  const role = headers.get(identityHeaders.role);
  if (role === "host") return { role: "host" };
  if (role !== "player") return null;

  const playerId = playerIdSchema.safeParse(headers.get(identityHeaders.playerId));
  const name = playerNameSchema.safeParse(decodeHeader(headers.get(identityHeaders.name)));
  if (!playerId.success || !name.success) return null;
  return { role: "player", playerId: playerId.data, name: name.data };
}

function decodeHeader(value: string | null): string | null {
  if (value === null) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
