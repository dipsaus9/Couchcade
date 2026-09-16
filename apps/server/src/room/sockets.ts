import type { PipProfile, PlayerId, PlayerInfo } from "@couchcade/protocol";

/**
 * Connection tags. They are fixed when a socket connects, so they only say host or phone. Seat and
 * audience status can change and live in the socket state instead.
 */
export const hostTag = "host";
export const phoneTag = "phone";

/**
 * Per-socket state, stored with `connection.setState()` so it survives hibernation. Keep it well
 * under 1 KB. CC-2.5 adds the flood bucket here.
 */
export interface HostSocketState {
  role: "host";
  /** Room time of the socket's last message other than a clock ping. */
  lastActiveAt: number;
}

export interface PhoneSocketState {
  role: "player" | "audience";
  id: PlayerId;
  name: string;
  /** 0 to 7, or null for audience. */
  slot: number | null;
  profile: PipProfile;
  joinedAt: number;
  lastActiveAt: number;
}

export type SocketState = HostSocketState | PhoneSocketState;

export function isHostState(state: SocketState | null): state is HostSocketState {
  return state?.role === "host";
}

export function isPhoneState(state: SocketState | null): state is PhoneSocketState {
  return state?.role === "player" || state?.role === "audience";
}

export function toPlayerInfo(state: PhoneSocketState, connected = true): PlayerInfo {
  return {
    id: state.id,
    name: state.name,
    slot: state.slot,
    profile: state.profile,
    joinedAt: state.joinedAt,
    connected,
  };
}

/** The lowest seat not in `taken`, or null when all `seatCount` seats are taken. */
export function lowestFreeSlot(taken: ReadonlySet<number>, seatCount: number): number | null {
  for (let slot = 0; slot < seatCount; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}
