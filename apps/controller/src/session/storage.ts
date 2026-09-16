import { isRoomCode } from "@couchcade/utils";

/** The key from docs/architecture/platform.md, "Tickets and rejoin tokens". */
export const sessionKey = "couchcade:session";

/** What a phone keeps to rejoin as the same player after a reload or a lost connection. */
export interface StoredSession {
  code: string;
  playerId: string;
  rejoinToken: string;
}

/** The part of `Storage` the session needs, so tests can pass a plain object. */
export type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's `sessionStorage`, or null when it is blocked (private mode, sandboxed frames). */
export function browserSessionStorage(): SessionStorageLike | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSession(storage: SessionStorageLike | null): StoredSession | null {
  try {
    const raw = storage?.getItem(sessionKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isStoredSession(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveSession(storage: SessionStorageLike | null, session: StoredSession): void {
  try {
    storage?.setItem(sessionKey, JSON.stringify(session));
  } catch {
    // Storage full or blocked: the phone still plays, it just can't rejoin after a reload.
  }
}

export function clearSession(storage: SessionStorageLike | null): void {
  try {
    storage?.removeItem(sessionKey);
  } catch {
    // Nothing to clear.
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) return false;
  const { code, playerId, rejoinToken } = value as Record<string, unknown>;
  return (
    typeof code === "string" &&
    isRoomCode(code) &&
    typeof playerId === "string" &&
    playerId.length > 0 &&
    typeof rejoinToken === "string" &&
    rejoinToken.length > 0
  );
}
