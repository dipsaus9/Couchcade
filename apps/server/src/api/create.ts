import { createRoomRequestSchema, type CreateRoomResponse } from "@couchcade/protocol";
import { internalPaths } from "../room/room.ts";
import { isRateLimited } from "../security/rate-limits.ts";
import { signRejoinToken, signTicket } from "../security/tickets.ts";
import { readJsonObject } from "./body.ts";
import type { ApiContext } from "./context.ts";
import { errorResponse } from "./errors.ts";
import { passcodeMatches } from "./passcode.ts";

/** Codes tried before giving up. Two live rooms on one code is already rare. */
export const maxCodeAttempts = 5;

/**
 * `POST /api/rooms`. Checks run cheapest first and nothing reaches a room until all of them passed
 * (docs/architecture/security.md, "Check order per endpoint").
 */
export async function createRoom(request: Request, ctx: ApiContext): Promise<Response> {
  // 1. RL_PASSCODE, 5 per IP per minute. It counts every attempt, not only wrong ones, because
  //    counting only failures would mean checking the passcode before the limit.
  if (await isRateLimited(ctx.env, "RL_PASSCODE", request)) return errorResponse("rate-limited");

  // 2. A JSON body under 1 KB that matches the schema. A missing passcode passes this step, so it
  //    still gets 401 below.
  const body = await readJsonObject(request);
  const parsed = body && createRoomRequestSchema.safeParse({ passcode: "", ...body });
  if (!parsed?.success) return errorResponse("bad-request");

  // 3. CC-2.2: Turnstile, action "create". Else 403.

  // 4. The passcode, in constant time.
  if (!(await passcodeMatches(parsed.data.passcode, ctx.env.HOST_PASSCODE))) {
    return errorResponse("wrong-passcode");
  }

  // 5. RL_CREATE, 3 room creations per IP per minute.
  if (await isRateLimited(ctx.env, "RL_CREATE", request)) return errorResponse("rate-limited");

  // 6. Create the room, picking another code when one is already in use.
  const secret = ctx.env.TICKET_SIGNING_SECRET;
  for (let attempt = 0; attempt < maxCodeAttempts; attempt++) {
    const code = ctx.newRoomCode();
    const created = await ctx.room(code).fetch(new URL(internalPaths.create, request.url), {
      method: "POST",
    });
    if (created.status !== 201) continue;

    const identity = { role: "host" } as const;
    const answer: CreateRoomResponse = {
      code,
      ticket: await signTicket(secret, code, identity),
      rejoinToken: await signRejoinToken(secret, code, identity),
    };
    return Response.json(answer, { status: 201 });
  }
  return errorResponse("no-free-code");
}
