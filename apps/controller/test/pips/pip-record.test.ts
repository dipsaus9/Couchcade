import type { PipProfile } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import {
  ensureStoredPlayer,
  loadStoredPlayer,
  playerRecordKey,
  saveStoredPlayer,
  type PlayerStorageLike,
} from "../../src/pips/pip-record.ts";

function fakeStorage(initial: Record<string, string> = {}): PlayerStorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const fresh: PipProfile = { skin: 4, hair: 4, hairColour: 0 };
const makeFresh = () => fresh;

describe("loadStoredPlayer", () => {
  it("returns null with no storage or no record", () => {
    expect(loadStoredPlayer(null, makeFresh)).toBeNull();
    expect(loadStoredPlayer(fakeStorage(), makeFresh)).toBeNull();
  });

  it("returns null for garbage JSON or a non-object value, never throwing", () => {
    expect(loadStoredPlayer(fakeStorage({ [playerRecordKey]: "{not json" }), makeFresh)).toBeNull();
    expect(loadStoredPlayer(fakeStorage({ [playerRecordKey]: "42" }), makeFresh)).toBeNull();
  });

  it("returns null for any v other than 1 (starts fresh)", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 2, name: "Noor", profile: fresh }),
    });
    expect(loadStoredPlayer(storage, makeFresh)).toBeNull();
  });

  it("reads a valid record back exactly", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Noor", profile: fresh }),
    });
    expect(loadStoredPlayer(storage, makeFresh)).toEqual({ v: 1, name: "Noor", profile: fresh });
  });

  it("drops a name that fails playerNameSchema, keeping the rest", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "", profile: fresh }),
    });
    expect(loadStoredPlayer(storage, makeFresh)).toEqual({ v: 1, name: "", profile: fresh });
  });

  it("repairs each out-of-range or missing profile field on its own", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({
        v: 1,
        name: "Sam",
        profile: { skin: 99, hair: 2, hairColour: -1 },
      }),
    });
    expect(loadStoredPlayer(storage, makeFresh)).toEqual({
      v: 1,
      name: "Sam",
      // skin and hairColour were out of range and redrawn from makeProfile; hair (2) was kept.
      profile: { skin: fresh.skin, hair: 2, hairColour: fresh.hairColour },
    });
  });

  it("redraws the whole profile when it is missing entirely", () => {
    const storage = fakeStorage({ [playerRecordKey]: JSON.stringify({ v: 1, name: "Sam" }) });
    expect(loadStoredPlayer(storage, makeFresh)).toEqual({ v: 1, name: "Sam", profile: fresh });
  });
});

describe("saveStoredPlayer", () => {
  it("writes the record as JSON under the pips.md key", () => {
    const storage = fakeStorage();
    saveStoredPlayer(storage, { v: 1, name: "Noor", profile: fresh });
    expect(JSON.parse(storage.getItem(playerRecordKey) as string)).toEqual({
      v: 1,
      name: "Noor",
      profile: fresh,
    });
  });

  it("never throws when storage is blocked", () => {
    const blocked: PlayerStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(() => saveStoredPlayer(blocked, { v: 1, name: "Noor", profile: fresh })).not.toThrow();
    expect(() => saveStoredPlayer(null, { v: 1, name: "Noor", profile: fresh })).not.toThrow();
  });
});

describe("ensureStoredPlayer", () => {
  it("makes and persists a record with makeProfile() on a first visit (no stored record)", () => {
    const storage = fakeStorage();
    const record = ensureStoredPlayer(storage, "Noor", makeFresh);

    expect(record).toEqual({ v: 1, name: "Noor", profile: fresh });
    expect(JSON.parse(storage.getItem(playerRecordKey) as string)).toEqual(record);
  });

  it("keeps the stored profile but refreshes the name on a later visit", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Old name", profile: fresh }),
    });
    // loadStoredPlayer always draws a fallback profile to repair with (see its own tests); a
    // fully valid stored profile like `fresh` never actually uses it.
    const other: PipProfile = { skin: 1, hair: 1, hairColour: 1 };
    const record = ensureStoredPlayer(storage, "Noor", () => other);

    expect(record).toEqual({ v: 1, name: "Noor", profile: fresh });
  });
});
