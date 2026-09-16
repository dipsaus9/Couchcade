/**
 * Room lifecycle deadlines (docs/architecture/platform.md, "Room states"). One alarm covers all
 * three: when it fires, the room closes or sets the alarm again for the next deadline.
 */

const minute = 60_000;

/** A live room with no messages other than keep-alive and clock pings for this long closes. */
export const idleTimeoutMs = 30 * minute;

/** A room without its TV for this long closes, whether the TV never came or went away. */
export const hostAwayTimeoutMs = 30 * minute;

/** No room lives longer than this. */
export const maxRoomAgeMs = 4 * 60 * minute;

/**
 * How stale a socket's last-activity time may get. Refreshing it at most once per interval keeps
 * the message handler cheap, and a deadline 30 minutes out doesn't need more precision.
 */
export const activityResolutionMs = minute;

/** States the relay tracks. `Closed` has no state: a closed room has no storage. */
export type RoomState = "waiting-for-host" | "live" | "host-away";

export interface LifecycleFacts {
  /** Room time when the room was created. */
  createdAt: number;
  /** Room time when the host last left, or null when the host never connected. */
  hostSeenAt: number | null;
  /** True when a host socket is open. */
  hostConnected: boolean;
  /** Latest activity over every open socket, or null when none are open. */
  lastActivityAt: number | null;
}

export function roomState({ hostConnected, hostSeenAt }: LifecycleFacts): RoomState {
  if (hostConnected) return "live";
  return hostSeenAt === null ? "waiting-for-host" : "host-away";
}

/** Room time at which the room must close, if nothing changes before then. */
export function closeDeadline(facts: LifecycleFacts): number {
  const tooOld = facts.createdAt + maxRoomAgeMs;
  if (!facts.hostConnected) {
    return Math.min(tooOld, (facts.hostSeenAt ?? facts.createdAt) + hostAwayTimeoutMs);
  }
  const lastActivity = Math.max(facts.lastActivityAt ?? facts.createdAt, facts.createdAt);
  return Math.min(tooOld, lastActivity + idleTimeoutMs);
}
