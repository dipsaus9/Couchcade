import {
  closeCodes,
  decode,
  encode,
  keepAlive,
  protocolVersion,
  relayToHostSchema,
  type HostToRelayMessage,
  type RelayToHostMessage,
} from "@couchcade/protocol";
import { PartySocket } from "partysocket";
import { ApiError, rejoinRoom } from "./api.ts";

export type ConnectionStatus = "connecting" | "open" | "reconnecting";

/** Why the host's socket stopped for good. It never reconnects after one of these. */
export type EndReason = "room-closed" | "replaced" | "session-invalid";

export interface RelayOptions {
  code: string;
  rejoinToken: string;
  /** The ticket from `POST /api/rooms`, used for the first connect only. Null after a refresh. */
  ticket: string | null;
  onMessage(message: RelayToHostMessage): void;
  onStatus(status: ConnectionStatus): void;
  onEnd(reason: EndReason): void;
}

export interface RelayConnection {
  send(message: HostToRelayMessage): void;
  close(): void;
}

/** Keep-alive from docs/architecture/platform.md, "Hibernation rules", rule 4. */
const pingEveryMs = 25_000;
const pongWithinMs = 10_000;

/**
 * Connects the host to `/ws/CODE` with partysocket. Before every connect after the first, it swaps
 * the rejoin token for a fresh ticket, so reconnects work long after the first ticket expired.
 */
export function connectRelay(options: RelayOptions): RelayConnection {
  let firstTicket = options.ticket;
  let ended = false;

  const end = (reason: EndReason): void => {
    if (ended) return;
    ended = true;
    stopKeepAlive();
    socket.close();
    options.onEnd(reason);
  };

  const socket = new PartySocket({
    host: location.host,
    protocol: location.protocol === "https:" ? "wss" : "ws",
    basePath: `ws/${options.code}`,
    maxReconnectionDelay: 10_000,
    query: async () => {
      const ticket = firstTicket ?? (await freshTicket());
      firstTicket = null;
      return { ticket, v: String(protocolVersion) };
    },
    shouldReconnectOnClose: (event) => endReasonFor(event.code) === null,
  });

  async function freshTicket(): Promise<string> {
    try {
      return (await rejoinRoom(options.code, options.rejoinToken)).ticket;
    } catch (error) {
      // 401: the token no longer works, for example after a secret rotation. Anything else, such as
      // a network error, is retried by partysocket with backoff.
      if (error instanceof ApiError && error.status === 401) end("session-invalid");
      throw error;
    }
  }

  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;

  function startKeepAlive(): void {
    stopKeepAlive();
    pingTimer = setInterval(() => {
      socket.send(keepAlive.ping);
      pongTimer ??= setTimeout(() => socket.reconnect(), pongWithinMs);
    }, pingEveryMs);
  }

  function stopKeepAlive(): void {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pingTimer = undefined;
    pongTimer = undefined;
  }

  options.onStatus("connecting");

  socket.addEventListener("open", () => {
    startKeepAlive();
    options.onStatus("open");
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    if (event.data === keepAlive.pong) {
      clearTimeout(pongTimer);
      pongTimer = undefined;
      return;
    }
    const result = decode(relayToHostSchema, event.data);
    if (result.ok) options.onMessage(result.message);
  });

  socket.addEventListener("close", (event: CloseEvent) => {
    stopKeepAlive();
    const reason = endReasonFor(event.code);
    if (reason) end(reason);
    else if (!ended) options.onStatus("reconnecting");
  });

  return {
    send: (message) => socket.send(encode(message)),
    close: () => {
      ended = true;
      stopKeepAlive();
      socket.close();
    },
  };
}

/** Close codes after which the host must not reconnect (docs/architecture/platform.md, "Close codes"). */
function endReasonFor(code: number): EndReason | null {
  switch (code) {
    case closeCodes.roomClosed:
      return "room-closed";
    case closeCodes.replaced:
      return "replaced";
    case closeCodes.kicked:
    case closeCodes.flooding:
    case closeCodes.seatExpired:
      return "session-invalid";
    default:
      return null;
  }
}
