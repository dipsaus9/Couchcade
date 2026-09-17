import type { StoredDisplayLag } from "@couchcade/game-sdk/clock";
import { onBeforeUnmount, shallowRef } from "vue";
import { ApiError, createRoom } from "../net/api.ts";
import {
  connectRelay,
  type ConnectionStatus,
  type EndReason,
  type RelayConnection,
} from "../net/relay-socket.ts";
import { gameRegistry, metaRegistry } from "../runtime/games.ts";
import {
  createHostRuntime,
  type CalibrationScreenState,
  type HostRuntime,
  type MenuScreenState,
  type MotionScreenState,
  type ResultsScreenState,
} from "../runtime/host-runtime.ts";
import { phaserStage } from "../runtime/stage.ts";
import {
  applyRelayMessage,
  initialLobby,
  setLocked,
  type LobbyState,
} from "../screens/lobby/lobby-state.ts";
import { createTurnstile } from "../security/turnstile.ts";
import { clearSession, loadSession, saveSession, type StoredSession } from "./storage.ts";

export type HostScreen =
  | { name: "passcode"; notice: string | null }
  | {
      name: "lobby";
      lobby: LobbyState;
      connection: ConnectionStatus;
      /** The stored TV lag for "Check TV lag", or null when never measured. */
      displayLag: StoredDisplayLag | null;
    }
  /** The TV lag check: players tap along with the flash. */
  | {
      name: "calibration";
      lobby: LobbyState;
      connection: ConnectionStatus;
      calibration: CalibrationScreenState;
    }
  /** Before a motion game: every phone enables motion or picks touch. */
  | { name: "motion"; lobby: LobbyState; connection: ConnectionStatus; motion: MotionScreenState }
  /** The VIP picks a game on their phone. */
  | { name: "menu"; lobby: LobbyState; connection: ConnectionStatus; menu: MenuScreenState }
  /** A game runs. The TV shows the stage with the game's scene. */
  | { name: "playing"; lobby: LobbyState; connection: ConnectionStatus }
  /** A game ended. The VIP's phone picks "Play again" or "Back to menu". */
  | {
      name: "results";
      lobby: LobbyState;
      connection: ConnectionStatus;
      results: ResultsScreenState;
    };

/**
 * The TV's session: passcode, room creation, the relay socket, the lobby state and the game
 * runtime. A refreshed tab rejoins its room with the stored rejoin token and never asks for the
 * passcode again.
 */
export function useHostSession() {
  const screen = shallowRef<HostScreen>({ name: "passcode", notice: null });
  let relay: RelayConnection | null = null;
  let runtime: HostRuntime | null = null;
  let moderation: Moderation | null = null;
  // The invisible Turnstile widget. It loads and runs only when the passcode is submitted.
  const turnstile = createTurnstile({ action: "create" });

  function enterRoom(session: StoredSession, ticket: string | null): void {
    relay?.close();
    runtime?.dispose();
    let lobby = initialLobby(session.code);
    let connection: ConnectionStatus = "connecting";
    const roomRuntime = createHostRuntime({
      metaRegistry,
      gameRegistry,
      stage: phaserStage,
      send: (message) => relay?.send(message),
      onChange: () => show(),
      reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    runtime = roomRuntime;
    const show = () => {
      const menu = roomRuntime.menu;
      const results = roomRuntime.results;
      const calibration = roomRuntime.calibration;
      const motion = roomRuntime.motion;
      if (menu) screen.value = { name: "menu", lobby, connection, menu };
      else if (motion) screen.value = { name: "motion", lobby, connection, motion };
      else if (results) screen.value = { name: "results", lobby, connection, results };
      else if (calibration) screen.value = { name: "calibration", lobby, connection, calibration };
      else if (roomRuntime.running) screen.value = { name: "playing", lobby, connection };
      else screen.value = { name: "lobby", lobby, connection, displayLag: roomRuntime.displayLag };
    };
    show();

    // Kick and Lock room on the TV lobby (docs/architecture/security.md). The relay closes a kicked
    // phone and answers with `player:left { reason: "kicked" }`. It doesn't echo a lock, so the
    // lobby applies it here.
    moderation = {
      kick: (id) => relay?.send({ t: "room:kick", d: { id } }),
      lock: (locked) => {
        if (!relay) return;
        relay.send({ t: "room:lock", d: { locked } });
        lobby = setLocked(lobby, locked);
        show();
      },
    };

    relay = connectRelay({
      code: session.code,
      rejoinToken: session.rejoinToken,
      ticket,
      onMessage: (message) => {
        const next = applyRelayMessage(lobby, message);
        const changed = next !== lobby;
        lobby = next;
        roomRuntime.handle(message, lobby);
        if (changed) show();
      },
      onStatus: (status) => {
        connection = status;
        if (status !== "open") roomRuntime.disconnected();
        show();
      },
      onEnd: (reason) => {
        relay = null;
        roomRuntime.dispose();
        runtime = null;
        moderation = null;
        clearSession();
        screen.value = { name: "passcode", notice: endNotice(reason) };
      },
    });
  }

  /** Creates a room. Resolves to referee-voice copy for the error, or null on success. */
  async function openRoom(passcode: string): Promise<string | null> {
    try {
      const token = await turnstile.token().catch(() => {
        throw new ApiError("turnstile", 0);
      });
      const { code, ticket, rejoinToken } = await createRoom(passcode, token);
      const session: StoredSession = { code, playerId: "host", rejoinToken };
      saveSession(session);
      enterRoom(session, ticket);
      return null;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "unexpected";
      // A 403 means the token was refused and is spent (security.md, "Where Turnstile runs").
      if (code.startsWith("turnstile")) turnstile.reset();
      return createErrorCopy(code);
    }
  }

  /** The TV lag check controls on the laptop (session-flow.md, "TV lag calibration"). */
  const calibration = {
    start: () => runtime?.checkTvLag(),
    skip: () => runtime?.skipCalibration(),
    retry: () => runtime?.retryCalibration(),
    frame: (roomTime: number) => runtime?.calibrationFrame(roomTime) ?? null,
  };

  /** Kick a player, and lock or unlock the room, from the TV lobby. */
  const moderate: Moderation = {
    kick: (id) => moderation?.kick(id),
    lock: (locked) => moderation?.lock(locked),
  };

  /** Ends the room for everyone. The relay closes every socket with 4004. */
  function endRoom(): void {
    relay?.send({ t: "room:end", d: {} });
  }

  const stored = loadSession();
  if (stored) enterRoom(stored, null);

  onBeforeUnmount(() => {
    runtime?.dispose();
    relay?.close();
  });

  return { screen, openRoom, endRoom, calibration, moderate };
}

interface Moderation {
  kick(id: string): void;
  lock(locked: boolean): void;
}

function createErrorCopy(code: string): string {
  switch (code) {
    case "wrong-passcode":
      return "That passcode doesn't match. Try again.";
    case "rate-limited":
      return "Too many tries. Wait a minute, then try again.";
    case "turnstile":
    case "turnstile-failed":
    case "turnstile-unavailable":
      return "We couldn't check this browser. Try again.";
    case "network":
      return "Can't reach Couchcade. Check the internet connection and try again.";
    default:
      return "Couldn't open a room. Try again in a minute.";
  }
}

function endNotice(reason: EndReason): string {
  switch (reason) {
    case "replaced":
      return "This room is open in another tab now. Enter the passcode to open a new room here.";
    case "room-closed":
    case "session-invalid":
      return "The room has closed. Enter the passcode to open a new one.";
  }
}
