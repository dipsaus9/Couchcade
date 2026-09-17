import { rejoinRequestSchema, type RejoinResponse } from "@couchcade/protocol";
import { isRoomCode } from "@couchcade/utils";
import { isRateLimited } from "../security/rate-limits.ts";
import { signTicket, verifyRejoinToken } from "../security/tickets.ts";
import { readJsonObject } from "./body.ts";
import type { ApiContext } from "./context.ts";
import { errorResponse } from "./errors.ts";

/**
 * `POST /api/rooms/:code/rejoin`. Swaps a rejoin token for a fresh ticket without calling the room.
 * The room checks kicked, revoked and the seat window when the socket connects
 * (docs/architecture/security.md, "Check order per endpoint").
 */
export async function rejoinRoom(
  request: Request,
  code: string,
  ctx: ApiContext,
): Promise<Response> {
  // 1. RL_REJOIN, 30 per IP per minute, enough for a TV and 8 phones reconnecting after a deploy.
  if (await isRateLimited(ctx.env, "RL_REJOIN", request)) return errorResponse("rate-limited");

  // 2. Code format, body schema, signature, `k` is "rejoin" and `r` is this room. Else 401.
  if (!isRoomCode(code)) return errorResponse("invalid-token");
  const body = await readJsonObject(request);
  const parsed = body && rejoinRequestSchema.safeParse(body);
  if (!parsed?.success) return errorResponse("invalid-token");
  const secret = ctx.env.TICKET_SIGNING_SECRET;
  const identity = await verifyRejoinToken(secret, parsed.data.rejoinToken, code);
  if (!identity) return errorResponse("invalid-token");

  // 3. A fresh ticket.
  const answer: RejoinResponse = { ticket: await signTicket(secret, code, identity) };
  return Response.json(answer);
}
