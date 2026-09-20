import { describe, expect, it } from "vitest";
import {
  clearMotionGrant,
  loadMotionGrant,
  motionGrantKey,
  saveMotionGrant,
  type MotionGrantStorageLike,
} from "../../src/motion/grant.ts";

function fakeStorage(initial: Record<string, string> = {}): MotionGrantStorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const grant = { gameId: "swing", title: "Swing", step: 1 };

describe("loadMotionGrant", () => {
  it("returns null with no storage or no record", () => {
    expect(loadMotionGrant(null)).toBeNull();
    expect(loadMotionGrant(fakeStorage())).toBeNull();
  });

  it("returns null for garbage, an incomplete record or a storage that throws", () => {
    expect(loadMotionGrant(fakeStorage({ [motionGrantKey]: "{not json" }))).toBeNull();
    expect(loadMotionGrant(fakeStorage({ [motionGrantKey]: "42" }))).toBeNull();
    expect(
      loadMotionGrant(fakeStorage({ [motionGrantKey]: JSON.stringify({ gameId: "swing" }) })),
    ).toBeNull();
    expect(
      loadMotionGrant(
        fakeStorage({ [motionGrantKey]: JSON.stringify({ gameId: "", title: "Swing", step: 1 }) }),
      ),
    ).toBeNull();
    const throwing: MotionGrantStorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadMotionGrant(throwing)).toBeNull();
  });

  it("returns a saved grant", () => {
    const storage = fakeStorage({ [motionGrantKey]: JSON.stringify(grant) });
    expect(loadMotionGrant(storage)).toEqual(grant);
  });
});

describe("saveMotionGrant and clearMotionGrant", () => {
  it("round-trips a grant and clears it", () => {
    const storage = fakeStorage();
    saveMotionGrant(storage, grant);
    expect(loadMotionGrant(storage)).toEqual(grant);
    clearMotionGrant(storage);
    expect(loadMotionGrant(storage)).toBeNull();
  });

  it("never throws when storage is null or blocked", () => {
    expect(() => saveMotionGrant(null, grant)).not.toThrow();
    expect(() => clearMotionGrant(null)).not.toThrow();
    const throwing: MotionGrantStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveMotionGrant(throwing, grant)).not.toThrow();
    expect(() => clearMotionGrant(throwing)).not.toThrow();
  });
});
