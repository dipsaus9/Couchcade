import { protocolVersion } from "@couchcade/protocol";
import { isRoomCode, roomCode } from "@couchcade/utils";
import { errorResponse, handleApi } from "./api/index.ts";
import { forwardHeaders, type SocketIdentity } from "./room/identity.ts";
import type { Room } from "./room/room.ts";
import { verifyTicket as verifyHmacTicket } from "./security/tickets.ts";

export { Room } from "./room/room.ts";

declare global {
  namespace Cloudflare {
    /** Bindings from wrangler.jsonc, and secrets from `wrangler secret put` or `.dev.vars`. */
    interface Env {
      Room: DurableObjectNamespace<Room>;
      /** Rate limits from docs/architecture/security.md, applied by CC-2.3. */
      RL_PASSCODE: RateLimit;
      RL_CREATE: RateLimit;
      RL_JOIN: RateLimit;
      RL_REJOIN: RateLimit;
      RL_UPGRADE: RateLimit;
      /** The passcode that creates rooms. Unset means nobody can create one. */
      HOST_PASSCODE?: string;
      /** Signs tickets and rejoin tokens. Unset or under 32 characters refuses every token. */
      TICKET_SIGNING_SECRET?: string;
    }
  }
}

/**
 * Checks the `ticket` query parameter of a socket upgrade for room `code`. Returns who the socket
 * belongs to, or null to refuse it with 401. It runs before any room is called.
 */
export type TicketVerifier = (
  ticket: string | null,
  code: string,
  env: Cloudflare.Env,
) => Promise<SocketIdentity | null>;

/**
 * The real verifier: an HMAC-SHA-256 ticket with `k: "ticket"`, bound to the room and role, valid
 * for 60 seconds (docs/architecture/platform.md, "Tickets and rejoin tokens").
 */
export const signedTickets: TicketVerifier = (ticket, code, env) =>
  verifyHmacTicket(env.TICKET_SIGNING_SECRET, ticket, code);

export interface WorkerOptions {
  verifyTicket: TicketVerifier;
  /** Picks room codes for new rooms. Tests pass their own to force code collisions. */
  newRoomCode?: () => string;
}

/** Every room lives in western Europe, close to the living room. */
const roomLocationHint: DurableObjectLocationHint = "weur";

/**
 * The stub for room `code`. Always use this, never partyserver's `getServerByName`, which costs an
 * extra Durable Object request per call.
 */
export function roomStub(env: Pick<Cloudflare.Env, "Room">, code: string): DurableObjectStub<Room> {
  return env.Room.get(env.Room.idFromName(code), { locationHint: roomLocationHint });
}

const socketRoute = /^\/ws\/([^/]+)$/;

/**
 * The Worker runs only for `/api/*` and `/ws/*`. Static files never reach it
 * (docs/architecture/platform.md, "Worker routing").
 */
export function createWorker({ verifyTicket, newRoomCode = roomCode }: WorkerOptions) {
  return {
    async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
      const url = new URL(request.url);
      const socket = socketRoute.exec(url.pathname);
      if (socket) return connectSocket(request, url, socket[1] ?? "", env, verifyTicket);
      if (url.pathname.startsWith("/api/")) {
        return handleApi(request, url, { env, newRoomCode, room: (code) => roomStub(env, code) });
      }
      return errorResponse("not-found");
    },
  } satisfies ExportedHandler<Cloudflare.Env>;
}

async function connectSocket(
  request: Request,
  url: URL,
  code: string,
  env: Cloudflare.Env,
  verifyTicket: TicketVerifier,
): Promise<Response> {
  if (!isRoomCode(code)) return errorResponse("not-found");
  // 1. A WebSocket upgrade.
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return errorResponse("websocket-required");
  }
  // 2. `Origin` is this site, so another website can't open a socket from a guest's browser.
  if (request.headers.get("Origin") !== url.origin) return errorResponse("forbidden-origin");
  // 3. A protocol version this server speaks.
  if (url.searchParams.get("v") !== String(protocolVersion)) {
    return errorResponse("unsupported-version");
  }
  // 4. CC-2.3: RL_UPGRADE per IP, else 429 rate-limited.
  // 5. A valid ticket for this room.
  const identity = await verifyTicket(url.searchParams.get("ticket"), code, env);
  if (!identity) return errorResponse("invalid-ticket");

  // partyserver uses `_pk` as the connection id, and the id is also a connection tag. A client
  // must never pick it, or it could tag its socket as the host.
  url.searchParams.delete("_pk");
  const forwarded = new Request(url, {
    method: "GET",
    headers: forwardHeaders(request.headers, identity),
  });
  return roomStub(env, code).fetch(forwarded);
}

export default createWorker({ verifyTicket: signedTickets });
