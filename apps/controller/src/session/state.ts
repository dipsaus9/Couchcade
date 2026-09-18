import {
  closeCodes,
  type ControllerView,
  type PlayerInfo,
  type RelayToPhoneMessage,
  type RoomPhase,
} from "@couchcade/protocol";
import type { JoinFailure } from "../join/api.ts";
import type { JoinDraft } from "../join/form.ts";
import { parseMotionPermissionView } from "../motion/view.ts";
import { parseCalibrationView } from "../screens/calibration/calibration-view.ts";
import { parseMenuView } from "../screens/menu/menu-view.ts";
import { parseResultsView } from "../screens/results/results-view.ts";
import type { StoredSession } from "./storage.ts";

/** Why the phone left a room for good. The phone doesn't reconnect after any of these. */
export type EndReason =
  | "kicked"
  | "room-closed"
  | "flooding"
  | "replaced"
  | "seat-expired"
  | "rejoin-refused"
  | "room-full";

/** A message on the join screen: why the last join failed or why the phone left a room. */
export type Notice =
  | { kind: "join-failed"; failure: JoinFailure }
  | { kind: "ended"; reason: EndReason; code: string };

export type PhoneState =
  | { status: "join"; draft: JoinDraft; submitting: boolean; notice: Notice | null }
  /** Joined through the API (or resuming a stored session), socket not welcomed yet. */
  | { status: "connecting"; session: StoredSession }
  | {
      status: "room";
      session: StoredSession;
      you: PlayerInfo;
      role: "player" | "audience";
      phase: RoomPhase;
      /** False while the TV is away (`room:host { connected: false }`). */
      hostConnected: boolean;
      /**
       * False once this phone's socket has been gone for 1 second, while it reconnects. A shorter
       * drop keeps the last screen up (runtime/reconnect.ts).
       */
      online: boolean;
      gameId: string | null;
      /** The last view the host sent, or null before the first one. */
      view: ControllerView | null;
    };

export type PhoneEvent =
  | { type: "join-submitted"; draft: JoinDraft }
  | { type: "join-failed"; failure: JoinFailure }
  | { type: "joined"; session: StoredSession }
  | { type: "socket-open" }
  | { type: "socket-lost" }
  | { type: "message"; message: RelayToPhoneMessage }
  | { type: "ended"; reason: EndReason }
  /** "Join another room" after an ended room: an empty join form, the name kept. */
  | { type: "notice-dismissed" };

/** Which screen the phone shows. `showsGameController` decides about game controllers. */
export type PhoneScreen =
  | "join"
  | "connecting"
  | "lobby"
  | "menu"
  | "results"
  | "calibration"
  | "motion-permission"
  | "audience"
  | "next-game"
  | "waiting";

/**
 * The first state after the page loads. A stored session for the same room resumes it: a reload
 * keeps the player's seat. A QR link to another room starts a fresh join instead.
 */
export function initialState(urlCode: string | null, stored: StoredSession | null): PhoneState {
  if (stored && (urlCode === null || urlCode === stored.code)) {
    return { status: "connecting", session: stored };
  }
  return {
    status: "join",
    draft: { code: urlCode ?? "", name: "", codeFromUrl: urlCode !== null },
    submitting: false,
    notice: null,
  };
}

export function reduce(state: PhoneState, event: PhoneEvent): PhoneState {
  switch (event.type) {
    case "join-submitted":
      return { status: "join", draft: event.draft, submitting: true, notice: null };
    case "join-failed":
      if (state.status !== "join") return state;
      return {
        ...state,
        submitting: false,
        notice: { kind: "join-failed", failure: event.failure },
      };
    case "joined":
      return { status: "connecting", session: event.session };
    case "socket-open":
    case "socket-lost":
      if (state.status !== "room") return state;
      return { ...state, online: event.type === "socket-open" };
    case "message":
      return onMessage(state, event.message);
    case "notice-dismissed":
      if (state.status !== "join" || state.notice === null) return state;
      return {
        ...state,
        draft: { code: "", name: state.draft.name, codeFromUrl: false },
        notice: null,
      };
    case "ended": {
      if (state.status === "join") return state;
      const { code } = state.session;
      return {
        status: "join",
        draft: { code, name: state.status === "room" ? state.you.name : "", codeFromUrl: false },
        submitting: false,
        notice: { kind: "ended", reason: event.reason, code },
      };
    }
  }
}

function onMessage(state: PhoneState, message: RelayToPhoneMessage): PhoneState {
  if (state.status === "join") return state;
  switch (message.t) {
    case "room:welcome": {
      const { role, phase, you } = message.d;
      // On a reconnect the last view stays up until the host sends the current one.
      const previous = state.status === "room" ? state : null;
      return {
        status: "room",
        session: state.session,
        you,
        role,
        phase,
        hostConnected: previous?.hostConnected ?? true,
        online: true,
        gameId: previous?.gameId ?? null,
        view: previous?.view ?? null,
      };
    }
    case "room:host":
      if (state.status !== "room") return state;
      return { ...state, hostConnected: message.d.connected };
    case "controller:state":
      if (state.status !== "room") return state;
      return { ...state, gameId: message.d.gameId, view: message.d.view };
    case "player:promoted":
      if (state.status !== "room" || message.d.id !== state.you.id) return state;
      return { ...state, role: "player", you: { ...state.you, slot: message.d.slot } };
    case "clock:pong":
      // Clock sync arrives with CC-1.14.
      return state;
    case "rtc:answer":
      // session.ts's onMessage hands this to the link runtime directly, the same way it does
      // clock:pong; it never reaches here. Kept for RelayToPhoneMessage's exhaustive switch.
      return state;
  }
}

export function screenOf(state: PhoneState): PhoneScreen {
  if (state.status !== "room") return state.status;
  // Audience phones watch, whatever the host last sent. Without the socket or the TV, the waiting
  // screen says why.
  if (state.role === "audience")
    return state.online && state.hostConnected ? "audience" : "waiting";
  const { view, gameId, phase } = state;
  if (view === null) return phase === "lobby" ? "lobby" : "waiting";
  // Seated but not in this game: a late joiner or promoted audience member. The host sends it with
  // the running game's id, so it comes before the game controller.
  if (view.screen === "next-game") return "next-game";
  if (gameId !== null) return "waiting";
  if (view.screen === "lobby") return "lobby";
  // Picking and playing again need the socket and the TV. Until both are back, the waiting screen
  // says why.
  if (view.screen === "menu" && state.online && state.hostConnected && parseMenuView(view.data)) {
    return "menu";
  }
  if (
    view.screen === "results" &&
    state.online &&
    state.hostConnected &&
    parseResultsView(view.data)
  ) {
    return "results";
  }
  // A tap only means something while the TV flashes, so the TV lag check needs both too.
  if (
    view.screen === "calibration" &&
    state.online &&
    state.hostConnected &&
    parseCalibrationView(view.data)
  ) {
    return "calibration";
  }
  // The motion step asks for sensors and tells the TV, so it needs both too.
  if (
    view.screen === "motion-permission" &&
    state.online &&
    state.hostConnected &&
    parseMotionPermissionView(view.data)
  ) {
    return "motion-permission";
  }
  return "waiting";
}

const endReasonByCloseCode: Record<number, EndReason> = {
  [closeCodes.kicked]: "kicked",
  [closeCodes.roomClosed]: "room-closed",
  [closeCodes.flooding]: "flooding",
  [closeCodes.replaced]: "replaced",
  [closeCodes.seatExpired]: "seat-expired",
  [closeCodes.roomFull]: "room-full",
};

/** The end reason for a close code, or null when the phone should reconnect. */
export function endReasonForClose(code: number): EndReason | null {
  return endReasonByCloseCode[code] ?? null;
}
