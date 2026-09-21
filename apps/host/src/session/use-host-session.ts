import { audio } from "@couchcade/audio";
import type { StoredDisplayLag } from "@couchcade/game-sdk/clock";
import type { RelayToHostMessage } from "@couchcade/protocol";
import { onBeforeUnmount, ref, shallowRef } from "vue";
import {
  createAttractState,
  type AttractPreview,
  type AttractState,
} from "../attract/attract-state.ts";
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
import { scheduleTimeout } from "../runtime/timing.ts";
import {
  applyRelayMessage,
  initialLobby,
  setLocked,
  type LobbyState,
} from "../screens/lobby/lobby-state.ts";
import { createTurnstile } from "../security/turnstile.ts";
import { settings } from "../settings/store.ts";
import { clearSession, loadSession, saveSession, type StoredSession } from "./storage.ts";

/**
 * True for a `player:joined` message that actually adds someone new to `before` -- not the burst
 * of `player:joined` replays the relay sends for every already-known player right after
 * `room:welcome` rebuilds the roster from scratch (lobby-state.ts's `room:welcome` case), which
 * would otherwise play a `ui` pop for every seated player each time the TV reconnects or
 * refreshes. Exported for the unit test (CC-7.7, docs/architecture/audio.md's token table:
 * "ui... a player joins the lobby").
 */
export function isNewLobbyJoin(before: LobbyState, message: RelayToHostMessage): boolean {
  return message.t === "player:joined" && !before.players.some((p) => p.id === message.d.player.id);
}

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
    }
  /**
   * The lobby sat empty for 60 s (CC-9.3, `attract-state.ts`): the TV cycles game previews like
   * an arcade cabinet's demo loop until someone joins, which returns it to `lobby` at once.
   */
  | { name: "attract"; lobby: LobbyState; connection: ConnectionStatus; preview: AttractPreview };

/**
 * The TV's session: passcode, room creation, the relay socket, the lobby state and the game
 * runtime. A refreshed tab rejoins its room with the stored rejoin token and never asks for the
 * passcode again.
 */
export function useHostSession() {
  const screen = shallowRef<HostScreen>({ name: "passcode", notice: null });
  // True once opening a room hit the Cloudflare Workers Free daily request budget
  // (errors/QuotaScreen.vue, errors/classify.ts): shown as its own screen instead of an inline
  // passcode notice, since there's nothing to retry until the next day's reset.
  const quotaReached = ref(false);
  let relay: RelayConnection | null = null;
  let runtime: HostRuntime | null = null;
  let attract: AttractState | null = null;
  let moderation: Moderation | null = null;
  // The invisible Turnstile widget. It loads and runs only when the passcode is submitted.
  const turnstile = createTurnstile({ action: "create" });

  function enterRoom(session: StoredSession, ticket: string | null): void {
    relay?.close();
    runtime?.dispose();
    attract?.dispose();
    let lobby = initialLobby(session.code);
    let connection: ConnectionStatus = "connecting";
    const roomRuntime = createHostRuntime({
      metaRegistry,
      gameRegistry,
      stage: phaserStage,
      send: (message) => relay?.send(message),
      onChange: () => show(),
      // CC-7.6: the laptop's stored reduced-motion setting, defaulting to prefers-reduced-motion
      // (docs/architecture/audio.md "Host settings").
      reducedMotion: () => settings.value.reducedMotion,
    });
    runtime = roomRuntime;
    // CC-9.3: attract mode is a TV-only cosmetic layered on top of the plain lobby -- the relay and
    // `roomRuntime` never leave the "lobby" phase for it, so it needs no place in `host-runtime.ts`.
    // `lobbyChanged` runs on every `show()` (its own no-op guard keeps that cheap), so the 60 s idle
    // timer starts the moment the lobby is first seen empty and a join always cancels it at once.
    const roomAttract = createAttractState({
      games: metaRegistry.games,
      schedule: scheduleTimeout,
      onChange: () => show(),
    });
    attract = roomAttract;
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
      else {
        roomAttract.lobbyChanged(lobby.players.length === 0);
        screen.value = roomAttract.preview
          ? { name: "attract", lobby, connection, preview: roomAttract.preview }
          : { name: "lobby", lobby, connection, displayLag: roomRuntime.displayLag };
      }
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
        if (isNewLobbyJoin(lobby, message)) audio.play("ui");
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
        roomAttract.dispose();
        attract = null;
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
      quotaReached.value = false;
      saveSession(session);
      enterRoom(session, ticket);
      return null;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "unexpected";
      // A 403 means the token was refused and is spent (security.md, "Where Turnstile runs").
      if (code.startsWith("turnstile")) turnstile.reset();
      if (code === "quota") {
        quotaReached.value = true;
        return null;
      }
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

  /**
   * "End game" on the TV (CC-3.27): stops the running game and reopens the menu, without closing
   * the room the way `endRoom` does. The host's own tap always may; a phone's `ui:action` is
   * gated to the VIP inside `host-runtime.ts`.
   */
  function endGameEarly(): void {
    runtime?.endGameEarly();
  }

  const stored = loadSession();
  if (stored) enterRoom(stored, null);

  onBeforeUnmount(() => {
    runtime?.dispose();
    attract?.dispose();
    relay?.close();
  });

  return { screen, openRoom, endRoom, calibration, moderate, endGameEarly, quotaReached };
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
