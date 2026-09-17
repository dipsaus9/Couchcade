import {
  joinRoomRequestSchema,
  playerNameSchema,
  seatCount,
  type JoinRoomResponse,
} from "@couchcade/protocol";
import { isRoomCode, roomCode } from "@couchcade/utils";
import { internalPaths, type RoomStatus } from "../room/room.ts";
import { isRateLimited } from "../security/rate-limits.ts";
import { signRejoinToken, signTicket } from "../security/tickets.ts";
import { readJsonObject } from "./body.ts";
import type { ApiContext } from "./context.ts";
import { errorResponse } from "./errors.ts";
import { turnstileError } from "./turnstile.ts";

/** Phones a room holds: 8 players and 8 audience (owner decision, 16 September 2026). */
export const maxPhones = seatCount * 2;

/**
 * `POST /api/rooms/:code/join`. Checks run cheapest first, and the room is called once, for its
 * status, only after every other check passed (docs/architecture/security.md, "Check order per
 * endpoint").
 */
export async function joinRoom(request: Request, code: string, ctx: ApiContext): Promise<Response> {
  // 1. RL_JOIN, 20 per IP per minute. Every phone at a party shares the home Wi-Fi address.
  if (await isRateLimited(ctx.env, "RL_JOIN", request)) return errorResponse("rate-limited");

  // 2. A valid room code, then a JSON body under 4 KB that matches the schema. A missing Turnstile
  //    token passes this step, so it still gets 403 below.
  if (!isRoomCode(code)) return errorResponse("not-found");
  const body = await readJsonObject(request);
  const parsed = body && joinRoomRequestSchema.safeParse({ turnstile: "", ...body });
  if (!parsed?.success) return errorResponse("bad-request");

  // 3. Name rules. CC-2.4 replaces this with NFKC, the character allowlist and the blocklists.
  const name = playerNameSchema.safeParse(parsed.data.name.trim());
  if (!name.success) return errorResponse("name-not-allowed");

  // 4. Turnstile, action "join". Nothing skips it here: the smoke token only works on room creation.
  const failed = await turnstileError(request, parsed.data.turnstile, "join", ctx.env);
  if (failed) return errorResponse(failed);

  // 5. The room must be live (its TV connected), unlocked and not full.
  const answer = await ctx.room(code).fetch(new URL(internalPaths.status, request.url));
  if (answer.status !== 200) return errorResponse("not-found");
  const status = await answer.json<RoomStatus>();
  if (status.state !== "live") return errorResponse("not-found");
  if (status.locked) return errorResponse("room-locked");
  if (status.phones >= maxPhones) return errorResponse("room-full");

  // 6. Sign the ticket and the rejoin token for a new player id.
  const identity = { role: "player", playerId: newPlayerId(), name: name.data } as const;
  const secret = ctx.env.TICKET_SIGNING_SECRET;
  const joined: JoinRoomResponse = {
    playerId: identity.playerId,
    name: identity.name,
    ticket: await signTicket(secret, code, identity),
    rejoinToken: await signRejoinToken(secret, code, identity),
  };
  return Response.json(joined);
}

/** A player id: 8 secure random letters from the room code alphabet, so two room codes. */
function newPlayerId(): string {
  return roomCode() + roomCode();
}
