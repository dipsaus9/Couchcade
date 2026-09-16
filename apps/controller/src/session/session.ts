import { roomClock, type RoomClock } from "@couchcade/game-sdk/clock";
import type { PhoneToRelayMessage } from "@couchcade/protocol";
import { shallowRef, type ShallowRef } from "vue";
import { requestJoin, type FetchFn } from "../join/api.ts";
import { normaliseName, roomCodeFromSearch, type JoinDraft } from "../join/form.ts";
import { noTurnstile, type TurnstileProvider } from "../join/turnstile.ts";
import { keepScreenAwake, lockPortrait } from "../device/screen.ts";
import { watchReconnect, type ReconnectWatch } from "../runtime/reconnect.ts";
import { openRoomSocket, type RoomSocket } from "./socket.ts";
import { initialState, reduce, type PhoneEvent, type PhoneState } from "./state.ts";
import {
  browserSessionStorage,
  clearSession,
  loadSession,
  saveSession,
  type SessionStorageLike,
  type StoredSession,
} from "./storage.ts";

export interface PhoneSessionOptions {
  search?: string;
  storage?: SessionStorageLike | null;
  fetchFn?: FetchFn;
  turnstile?: TurnstileProvider;
  /** The room clock inputs are stamped with. Defaults to the shared `roomClock`. */
  clock?: Pick<RoomClock, "connect" | "disconnect" | "receive">;
}

export interface PhoneSession {
  state: Readonly<ShallowRef<PhoneState>>;
  join(draft: JoinDraft): Promise<void>;
  /** Sends a message to the room. Dropped while the phone has no socket. */
  send(message: PhoneToRelayMessage): void;
  dispose(): void;
}

/**
 * The phone's session: join through the API, keep the rejoin token, hold the room socket and turn
 * everything that happens into `PhoneState` through the pure `reduce`.
 */
export function createPhoneSession({
  search = globalThis.location.search,
  storage = browserSessionStorage(),
  fetchFn,
  turnstile = noTurnstile,
  clock = roomClock,
}: PhoneSessionOptions = {}): PhoneSession {
  const state = shallowRef(initialState(roomCodeFromSearch(search), loadSession(storage)));
  let socket: RoomSocket | null = null;
  let reconnect: ReconnectWatch | null = null;
  let releaseWakeLock: (() => void) | null = null;

  const dispatch = (event: PhoneEvent): void => {
    state.value = reduce(state.value, event);
  };

  function enterRoom(session: StoredSession, ticket?: string): void {
    releaseWakeLock ??= keepScreenAwake();
    // A phone that comes back to the page reconnects at once, with a fresh socket that skips the
    // backoff and rejoins with the stored token.
    reconnect ??= watchReconnect({
      isClosed: () => socket?.isClosed() ?? false,
      reconnectNow: () => enterRoom(session),
      onLostTooLong: () => dispatch({ type: "socket-lost" }),
    });
    socket?.close();
    socket = openRoomSocket({
      session,
      ticket,
      fetchFn,
      onMessage: (message) => {
        if (message.t === "clock:pong") return clock.receive(message.d);
        dispatch({ type: "message", message });
        // Every (re)connect syncs the room clock again: 5 samples, then 1 every 30 s (CC-1.14).
        if (message.t === "room:welcome") clock.connect((d) => send({ t: "clock:ping", d }));
      },
      onOpen: () => {
        reconnect?.opened();
        dispatch({ type: "socket-open" });
      },
      onLost: () => {
        clock.disconnect();
        // "Connection lost" shows only after 1 second without a socket.
        reconnect?.lost();
      },
      onEnded: (reason) => {
        socket = null;
        leaveRoom();
        dispatch({ type: "ended", reason });
      },
    });
  }

  function stopReconnecting(): void {
    reconnect?.dispose();
    reconnect = null;
  }

  function send(message: PhoneToRelayMessage): void {
    socket?.send(message);
  }

  function leaveRoom(): void {
    clock.disconnect();
    stopReconnecting();
    socket?.close();
    socket = null;
    releaseWakeLock?.();
    releaseWakeLock = null;
    clearSession(storage);
  }

  async function join(draft: JoinDraft): Promise<void> {
    if (state.value.status !== "join" || state.value.submitting) return;
    dispatch({ type: "join-submitted", draft });
    // Both need the tap that is happening right now on some phones.
    releaseWakeLock ??= keepScreenAwake();
    lockPortrait();

    const token = await turnstile.token().catch(() => null);
    const result =
      token === null
        ? ({ ok: false, failure: "turnstile" } as const)
        : await requestJoin(
            draft.code,
            { name: normaliseName(draft.name), turnstile: token },
            fetchFn,
          );
    if (!result.ok) {
      if (result.failure === "turnstile") turnstile.reset();
      releaseWakeLock?.();
      releaseWakeLock = null;
      dispatch({ type: "join-failed", failure: result.failure });
      return;
    }

    const { playerId, rejoinToken, ticket } = result.joined;
    const session: StoredSession = { code: draft.code, playerId, rejoinToken };
    saveSession(storage, session);
    dispatch({ type: "joined", session });
    enterRoom(session, ticket);
  }

  // A reload with a stored session rejoins the same seat.
  if (state.value.status === "connecting") enterRoom(state.value.session);

  return {
    state,
    join,
    send,
    dispose: () => {
      clock.disconnect();
      stopReconnecting();
      socket?.close();
      socket = null;
      releaseWakeLock?.();
      releaseWakeLock = null;
    },
  };
}
