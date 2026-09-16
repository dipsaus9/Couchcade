import {
  decode,
  encode,
  keepAlive,
  protocolVersion,
  relayToPhoneSchema,
  type PhoneToRelayMessage,
  type RelayToPhoneMessage,
} from "@couchcade/protocol";
import { PartySocket } from "partysocket";
import { requestRejoin, type FetchFn } from "../join/api.ts";
import { endReasonForClose, type EndReason } from "./state.ts";
import type { StoredSession } from "./storage.ts";

/** Keep-alive from docs/architecture/platform.md, "Hibernation rules": ping every 25 s. */
export const keepAliveIntervalMs = 25_000;
/** Reconnect when no pong arrives within this long after a ping. */
export const pongTimeoutMs = 10_000;

export interface RoomSocketOptions {
  session: StoredSession;
  /** The ticket from `/join`, used for the first connect. Without one, the first connect rejoins. */
  ticket?: string;
  onMessage(message: RelayToPhoneMessage): void;
  onOpen(): void;
  onLost(): void;
  /** The phone is out of the room for good. The socket is already closed. */
  onEnded(reason: EndReason): void;
  fetchFn?: FetchFn;
  /** Where the page is served from. The socket connects to the same origin. */
  location?: Pick<Location, "host" | "protocol">;
}

export interface RoomSocket {
  send(message: PhoneToRelayMessage): void;
  close(): void;
}

/**
 * The phone's connection to its room: a partysocket on `/ws/CODE?ticket=…&v=1`
 * (docs/architecture/platform.md, "Reconnects"). Every reconnect swaps the rejoin token for a
 * fresh 60-second ticket first. Close codes 4003 to 4011 end the session without reconnecting.
 */
export function openRoomSocket(options: RoomSocketOptions): RoomSocket {
  const { session, fetchFn, location = globalThis.location } = options;
  let firstTicket = options.ticket;
  let ended = false;

  const end = (reason: EndReason): void => {
    if (ended) return;
    ended = true;
    stopKeepAlive();
    socket.close();
    options.onEnded(reason);
  };

  const socket = new PartySocket({
    host: location.host,
    protocol: location.protocol === "https:" ? "wss" : "ws",
    basePath: `ws/${session.code}`,
    query: async () => {
      const ticket = firstTicket ?? (await freshTicket());
      firstTicket = undefined;
      return { ticket, v: String(protocolVersion) };
    },
    // Messages sent while disconnected are dropped, never sent late (docs/architecture/session-flow.md).
    maxEnqueuedMessages: 0,
    shouldReconnectOnClose: (event) => endReasonForClose(event.code) === null,
  });

  async function freshTicket(): Promise<string> {
    const result = await requestRejoin(session.code, session.rejoinToken, fetchFn);
    if (result.ok) return result.ticket;
    if (result.failure === "refused") end("rejoin-refused");
    // Throwing makes partysocket try again after its backoff, unless the session just ended.
    throw new Error(`Rejoin failed: ${result.failure}`);
  }

  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;

  function startKeepAlive(): void {
    stopKeepAlive();
    pingTimer = setInterval(() => {
      socket.send(keepAlive.ping);
      pongTimer ??= setTimeout(() => {
        pongTimer = undefined;
        socket.reconnect();
      }, pongTimeoutMs);
    }, keepAliveIntervalMs);
  }

  function stopKeepAlive(): void {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pingTimer = undefined;
    pongTimer = undefined;
  }

  socket.addEventListener("open", () => {
    startKeepAlive();
    options.onOpen();
  });

  socket.addEventListener("close", (event) => {
    stopKeepAlive();
    if (ended) return;
    const reason = endReasonForClose(event.code);
    if (reason) end(reason);
    else options.onLost();
  });

  socket.addEventListener("message", (event) => {
    if (event.data === keepAlive.pong) {
      clearTimeout(pongTimer);
      pongTimer = undefined;
      return;
    }
    const result = decode(relayToPhoneSchema, event.data);
    // Invalid frames are dropped silently (docs/architecture/platform.md, "Envelope").
    if (result.ok) options.onMessage(result.message);
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
