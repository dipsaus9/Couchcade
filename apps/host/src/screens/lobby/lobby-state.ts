import {
  seatCount,
  type PlayerInfo,
  type RelayToHostMessage,
  type RoomPhase,
} from "@couchcade/protocol";
import { players as playerStyles } from "@couchcade/theme";

/** What the TV knows about its room, built only from relay messages. */
export interface LobbyState {
  code: string;
  phase: RoomPhase;
  locked: boolean;
  /** Every player and audience member the relay told the host about, in join order. */
  players: readonly PlayerInfo[];
}

export type PlayerStyle = (typeof playerStyles)[number];

/** One of the 8 seats. An empty seat still has a style: the colour and shape the next player gets. */
export interface Seat {
  slot: number;
  style: PlayerStyle;
  player: PlayerInfo | null;
}

/** The state right after `POST /api/rooms`, before the relay has welcomed the host. */
export function initialLobby(code: string): LobbyState {
  return { code, phase: "lobby", locked: false, players: [] };
}

/**
 * Applies one relay message and returns the new state. Messages that don't change the lobby
 * return the same object. Never mutates `state`.
 */
export function applyRelayMessage(state: LobbyState, message: RelayToHostMessage): LobbyState {
  switch (message.t) {
    case "room:welcome":
      // The relay follows the welcome with one `player:joined` per known player, so a reconnecting
      // host rebuilds the list from scratch instead of keeping stale entries.
      return {
        code: message.d.code,
        phase: message.d.phase,
        locked: message.d.locked,
        players: [],
      };
    case "player:joined":
      return withPlayers(state, joinPlayer(state.players, message.d.player));
    case "player:left":
      // `disconnected` keeps the seat while the phone may come back. Every other reason frees it.
      return message.d.reason === "disconnected"
        ? updatePlayer(state, message.d.id, { connected: false })
        : withPlayers(
            state,
            state.players.filter((player) => player.id !== message.d.id),
          );
    case "player:reconnected":
      return updatePlayer(state, message.d.id, { connected: true });
    case "player:promoted":
      return updatePlayer(state, message.d.id, { slot: message.d.slot });
    case "player:profile":
      return updatePlayer(state, message.from, { profile: message.d.profile });
    default:
      return state;
  }
}

/** The 8 seats in slot order. */
export function seats(state: LobbyState): Seat[] {
  return playerStyles.slice(0, seatCount).map((style, slot) => ({
    slot,
    style,
    player: state.players.find((player) => player.slot === slot) ?? null,
  }));
}

/** Players with a seat, in join order. */
export function seatedPlayers(state: LobbyState): PlayerInfo[] {
  return state.players.filter((player) => player.slot !== null);
}

/** Phones without a seat, in join order. */
export function audience(state: LobbyState): PlayerInfo[] {
  return state.players.filter((player) => player.slot === null);
}

/** The VIP: the connected seated player who joined first. Undefined when nobody qualifies. */
export function vip(state: LobbyState): PlayerInfo | undefined {
  return seatedPlayers(state)
    .filter((player) => player.connected)
    .reduce<PlayerInfo | undefined>(
      (first, player) => (first === undefined || player.joinedAt < first.joinedAt ? player : first),
      undefined,
    );
}

function withPlayers(state: LobbyState, players: readonly PlayerInfo[]): LobbyState {
  return { ...state, players };
}

/**
 * Adds or replaces a player, keeping join order. When the relay seats someone in a slot that a
 * disconnected player still held, that seat was given away, so the old entry goes.
 */
function joinPlayer(players: readonly PlayerInfo[], joined: PlayerInfo): PlayerInfo[] {
  const others = players.filter(
    (player) =>
      player.id !== joined.id &&
      !(joined.slot !== null && player.slot === joined.slot && !player.connected),
  );
  return [...others, joined].toSorted((a, b) => a.joinedAt - b.joinedAt);
}

function updatePlayer(
  state: LobbyState,
  id: string,
  change: Partial<Pick<PlayerInfo, "connected" | "slot" | "profile">>,
): LobbyState {
  if (!state.players.some((player) => player.id === id)) return state;
  return withPlayers(
    state,
    state.players.map((player) => (player.id === id ? { ...player, ...change } : player)),
  );
}
