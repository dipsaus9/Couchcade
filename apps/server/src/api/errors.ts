// Error codes the Worker answers with. Every error body is `{ error: code }`, and the apps map the
// code to referee-voice copy (docs/architecture/platform.md, "HTTP API"). The code decides the
// status, so a code always means the same status.

export const apiErrorStatus = {
  /** The body isn't JSON under 4 KB, or doesn't match the request schema. */
  "bad-request": 400,
  /** The upgrade isn't a `GET` with `Upgrade: websocket`. */
  "websocket-required": 400,
  /** The player name breaks the name rules (CC-2.4 adds normalisation and the blocklists). */
  "name-not-allowed": 400,
  /** `POST /api/rooms` without the right host passcode. */
  "wrong-passcode": 401,
  /** The rejoin token is missing, forged, for another room or not a rejoin token. */
  "invalid-token": 401,
  /** The socket ticket is missing, forged, expired, for another room or not a ticket. */
  "invalid-ticket": 401,
  /** The `Origin` header isn't this site. */
  "forbidden-origin": 403,
  /** The Turnstile token is missing, invalid, spent, or for another action or site. */
  "turnstile-failed": 403,
  /** TURNSTILE_SECRET_KEY isn't set, or Siteverify errored or timed out. The check fails closed. */
  "turnstile-unavailable": 403,
  /** No such route, a malformed room code, no such room, or a room without its TV. */
  "not-found": 404,
  /** A known API route called with a method other than `POST`. */
  "method-not-allowed": 405,
  /** The room already holds 16 phones (8 players and 8 audience). */
  "room-full": 409,
  /** The host locked the room (CC-2.6). */
  "room-locked": 423,
  /** The `v` query parameter isn't a protocol version this server speaks. */
  "unsupported-version": 426,
  /** A rate limit said no (CC-2.3). */
  "rate-limited": 429,
  /** TICKET_SIGNING_SECRET isn't set, or is shorter than 32 characters. */
  "not-configured": 500,
  /** Five random room codes in a row were already in use. */
  "no-free-code": 503,
} as const;

export type ApiErrorCode = keyof typeof apiErrorStatus;

export const apiErrorCodes = Object.keys(apiErrorStatus) as ApiErrorCode[];

export function errorResponse(error: ApiErrorCode, headers?: HeadersInit): Response {
  return Response.json({ error }, { status: apiErrorStatus[error], headers });
}
