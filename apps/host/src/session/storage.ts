import { isRoomCode } from "@couchcade/utils";

/** What the TV keeps to rejoin its room after a refresh (docs/architecture/platform.md, "Tickets"). */
export interface StoredSession {
  code: string;
  playerId: "host";
  rejoinToken: string;
}

const key = "couchcade:session";

/** The stored session, or null when there is none or it can't be read. */
export function loadSession(): StoredSession | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { code, playerId, rejoinToken } = value as Record<string, unknown>;
    if (typeof code !== "string" || !isRoomCode(code)) return null;
    if (playerId !== "host" || typeof rejoinToken !== "string" || rejoinToken === "") return null;
    return { code, playerId, rejoinToken };
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(session));
  } catch {
    // Storage can be blocked. The room still works; a refresh just asks for the passcode again.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
