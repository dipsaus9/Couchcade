/**
 * Remembers a motion permission grant across a page reload (CC-5.13). `session.ts`'s state resets
 * on every reload, but the browser's own permission decision usually doesn't (motion.md, "After
 * 'Don't allow'": WebKit keeps the decision per site). Without a record of our own, a reload mid
 * motion game has nothing to tell it apart from a game that never asked, so it lands on touch even
 * though the browser would still say granted. This key, written the moment a game's motion step
 * reaches "ready" and cleared the moment it doesn't, is that record.
 */

/** The key this phone remembers a motion grant under. */
export const motionGrantKey = "couchcade:motion-grant";

/** What's remembered: enough to show the resume step for the same game, not a new one. */
export interface MotionGrant {
  gameId: string;
  title: string;
  step: number;
}

/** The part of `Storage` the grant needs, so tests can pass a plain object (mirrors session/storage.ts). */
export type MotionGrantStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's `sessionStorage`, or null when it is blocked (private mode, sandboxed frames). */
export function browserMotionGrantStorage(): MotionGrantStorageLike | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isMotionGrant(value: unknown): value is MotionGrant {
  if (typeof value !== "object" || value === null) return false;
  const { gameId, title, step } = value as Record<string, unknown>;
  return (
    typeof gameId === "string" &&
    gameId.length > 0 &&
    typeof title === "string" &&
    typeof step === "number" &&
    Number.isInteger(step)
  );
}

/** Reads the remembered grant. Storage blocked or holding garbage reads as "no grant". */
export function loadMotionGrant(storage: MotionGrantStorageLike | null): MotionGrant | null {
  try {
    const raw = storage?.getItem(motionGrantKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isMotionGrant(value) ? value : null;
  } catch {
    return null;
  }
}

/** Writes the grant. Storage full or blocked never throws: a later reload just won't recover motion. */
export function saveMotionGrant(storage: MotionGrantStorageLike | null, grant: MotionGrant): void {
  try {
    storage?.setItem(motionGrantKey, JSON.stringify(grant));
  } catch {
    // Nothing to do: the grant just won't survive a reload this time.
  }
}

/** Clears the grant: the player switched to touch, or the motion game ended. */
export function clearMotionGrant(storage: MotionGrantStorageLike | null): void {
  try {
    storage?.removeItem(motionGrantKey);
  } catch {
    // Nothing to clear.
  }
}
