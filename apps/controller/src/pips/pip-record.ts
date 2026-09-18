import { pipParts } from "@couchcade/utils/pips";
import { playerNameSchema, type PipProfile } from "@couchcade/protocol";

/** The key from docs/architecture/pips.md, "On the phone: remembering a Pip". */
export const playerRecordKey = "couchcade:player";

/** What a phone keeps to remember its name and Pip between rooms. */
export interface StoredPlayer {
  v: 1;
  name: string;
  profile: PipProfile;
}

/** The part of `Storage` the record needs, so tests can pass a plain object (mirrors session/storage.ts). */
export type PlayerStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's `localStorage`, or null when it is blocked (private mode, sandboxed frames). */
export function browserPlayerStorage(): PlayerStorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const partCount: Record<keyof PipProfile, number> = {
  skin: pipParts.skin,
  hair: pipParts.hair.length,
  hairColour: pipParts.hairColour,
};

/** True when `value` is an integer inside `[0, count)`. */
function isValidIndex(value: unknown, count: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < count;
}

/**
 * Loads `couchcade:player`, repairing what it can (pips.md "Reading"): a `v` other than 1 starts
 * fresh, a name that fails `playerNameSchema` is dropped, and each profile field is kept if valid
 * or redrawn on its own with `makeProfile` (a fresh `randomPip` on a real page load, a fixed value
 * in tests). A repaired record is returned so the caller can write it straight back. Storage
 * blocked or holding garbage never throws: it reads as "no record".
 */
export function loadStoredPlayer(
  storage: PlayerStorageLike | null,
  makeProfile: () => PipProfile,
): StoredPlayer | null {
  let raw: string | null;
  try {
    raw = storage?.getItem(playerRecordKey) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1) return null;

  const nameCheck = playerNameSchema.safeParse(record.name);
  const name = nameCheck.success ? nameCheck.data : "";

  const rawProfile =
    typeof record.profile === "object" && record.profile !== null
      ? (record.profile as Record<string, unknown>)
      : {};
  const fresh = makeProfile();
  const profile: PipProfile = {
    skin: isValidIndex(rawProfile.skin, partCount.skin) ? rawProfile.skin : fresh.skin,
    hair: isValidIndex(rawProfile.hair, partCount.hair) ? rawProfile.hair : fresh.hair,
    hairColour: isValidIndex(rawProfile.hairColour, partCount.hairColour)
      ? rawProfile.hairColour
      : fresh.hairColour,
  };

  return { v: 1, name, profile };
}

/** Writes the record. Storage full or blocked never throws: the phone still works, it just won't remember. */
export function saveStoredPlayer(storage: PlayerStorageLike | null, record: StoredPlayer): void {
  try {
    storage?.setItem(playerRecordKey, JSON.stringify(record));
  } catch {
    // Nothing to do: the phone plays this session without remembering the Pip.
  }
}

/**
 * Loads the remembered record, or makes one with `makeProfile()` and persists it immediately
 * (pips.md "Writing", item 1: "After the first random Pip is made"). Every caller that needs a
 * Pip to actually use — the join body, the lobby's on-entry reconcile, the customiser — goes
 * through this instead of `loadStoredPlayer` alone, so a first-visit phone always has a record
 * before anything asks for one. `name` refreshes the record's saved name on every call.
 */
export function ensureStoredPlayer(
  storage: PlayerStorageLike | null,
  name: string,
  makeProfile: () => PipProfile,
): StoredPlayer {
  const stored = loadStoredPlayer(storage, makeProfile);
  const record: StoredPlayer = { v: 1, name, profile: stored?.profile ?? makeProfile() };
  saveStoredPlayer(storage, record);
  return record;
}
