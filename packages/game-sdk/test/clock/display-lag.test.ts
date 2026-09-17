import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampDisplayLagMs,
  displayLagStorageKey,
  getDisplayLagMs,
  maxDisplayLagMs,
  readDisplayLag,
  saveDisplayLag,
} from "@couchcade/game-sdk/clock";
import type { DisplayLagStorage } from "@couchcade/game-sdk/clock";

/** An in-memory Web Storage. */
function memoryStorage(entries: Record<string, string> = {}): DisplayLagStorage & {
  entries: Record<string, string>;
} {
  return {
    entries,
    getItem: (key) => entries[key] ?? null,
    setItem: (key, value) => {
      entries[key] = value;
    },
  };
}

const blocked: DisplayLagStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDisplayLagMs", () => {
  it("is 0 on a TV that was never calibrated", () => {
    expect(getDisplayLagMs(memoryStorage())).toBe(0);
    expect(readDisplayLag(memoryStorage())).toBeNull();
  });

  it("is 0 without any storage, and where localStorage doesn't exist", () => {
    expect(getDisplayLagMs(null)).toBe(0);
    vi.stubGlobal("localStorage", undefined);
    expect(getDisplayLagMs()).toBe(0);
  });

  it("is 0 when storage is blocked", () => {
    expect(getDisplayLagMs(blocked)).toBe(0);
  });

  it("is 0 for a broken entry", () => {
    for (const raw of [
      "not json",
      "80",
      "null",
      '{"ms":"80","measuredAt":1}',
      '{"ms":80}',
      '{"ms":-5,"measuredAt":1}',
      '{"ms":401,"measuredAt":1}',
    ]) {
      expect(getDisplayLagMs(memoryStorage({ [displayLagStorageKey]: raw }))).toBe(0);
    }
  });

  it("reads what the calibration stored under couchcade:display-lag", () => {
    const storage = memoryStorage();
    expect(saveDisplayLag(86.4, 1_789_000_000_000, storage)).toEqual({
      ms: 86,
      measuredAt: 1_789_000_000_000,
    });
    expect(JSON.parse(storage.entries["couchcade:display-lag"]!)).toEqual({
      ms: 86,
      measuredAt: 1_789_000_000_000,
    });
    expect(getDisplayLagMs(storage)).toBe(86);
    expect(readDisplayLag(storage)).toEqual({ ms: 86, measuredAt: 1_789_000_000_000 });
  });

  it("uses the global localStorage by default", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    saveDisplayLag(120, 5);
    expect(getDisplayLagMs()).toBe(120);
  });
});

describe("saveDisplayLag", () => {
  it("clamps to 0-400 ms in whole milliseconds", () => {
    expect(maxDisplayLagMs).toBe(400);
    expect(clampDisplayLagMs(-30)).toBe(0);
    expect(clampDisplayLagMs(912)).toBe(400);
    expect(clampDisplayLagMs(79.6)).toBe(80);
    const storage = memoryStorage();
    saveDisplayLag(900, 1, storage);
    expect(getDisplayLagMs(storage)).toBe(400);
  });

  it("doesn't throw when storage is blocked", () => {
    expect(saveDisplayLag(80, 1, blocked)).toEqual({ ms: 80, measuredAt: 1 });
    expect(saveDisplayLag(80, 1, null)).toEqual({ ms: 80, measuredAt: 1 });
  });
});
