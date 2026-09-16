import { isUsableSecret } from "../security/tickets.ts";
import type { ApiContext } from "./context.ts";
import { createRoom } from "./create.ts";
import { errorResponse } from "./errors.ts";
import { joinRoom } from "./join.ts";
import { rejoinRoom } from "./rejoin.ts";

export type { ApiContext } from "./context.ts";
export { apiErrorCodes, apiErrorStatus, errorResponse, type ApiErrorCode } from "./errors.ts";

const apiRoute = /^\/api\/rooms(?:\/([^/]+)\/(join|rejoin))?$/;

/**
 * The HTTP API under `/api/` (docs/architecture/platform.md, "HTTP API"). The shared checks run
 * first and never call a room: route, `Origin`, method and the signing secret. Each endpoint then
 * runs its own checks in the documented order.
 */
export async function handleApi(request: Request, url: URL, ctx: ApiContext): Promise<Response> {
  const route = apiRoute.exec(url.pathname);
  if (!route) return errorResponse("not-found");

  // Browsers always send `Origin` on a POST. Another site's page is refused. Scripts can leave it
  // out or fake it, so the passcode, Turnstile and tickets stay the real gates.
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== url.origin) return errorResponse("forbidden-origin");

  if (request.method !== "POST") return errorResponse("method-not-allowed", { Allow: "POST" });
  if (!isUsableSecret(ctx.env.TICKET_SIGNING_SECRET)) return errorResponse("not-configured");

  const [, code, action] = route;
  if (code === undefined) return createRoom(request, ctx);
  return action === "join" ? joinRoom(request, code, ctx) : rejoinRoom(request, code, ctx);
}
