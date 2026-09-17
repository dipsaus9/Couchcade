import { audio, defaultVolumes } from "@couchcade/audio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostSettingsStorageKey } from "../../src/audio/host-settings.ts";
import {
  readReducedMotion,
  readSettings,
  writeSettings,
} from "../../src/settings/settings-storage.ts";
import type { HostSettingsWritableStorage } from "../../src/settings/settings-storage.ts";

/** An in-memory Web Storage, like ../audio/host-settings.test.ts's helper, with `setItem` added. */
function memoryStorage(entries: Record<string, string> = {}): HostSettingsWritableStorage & {
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readReducedMotion", () => {
  it("falls back to prefers() with nothing stored", () => {
    const prefers = vi.fn<() => boolean>(() => true);
    expect(readReducedMotion(memoryStorage(), prefers)).toBe(true);
  });

  it("falls back to prefers() without any storage", () => {
    const prefers = vi.fn<() => boolean>(() => true);
    expect(readReducedMotion(null, prefers)).toBe(true);
  });

  it("falls back to prefers() for a broken or older entry", () => {
    const prefers = vi.fn<() => boolean>(() => true);
    for (const raw of [
      "not json",
      "null",
      '{"v":1,"muted":false}',
      '{"v":2,"reducedMotion":true}',
      '{"v":1,"reducedMotion":"yes"}',
    ]) {
      expect(readReducedMotion(memoryStorage({ [hostSettingsStorageKey]: raw }), prefers)).toBe(
        true,
      );
    }
  });

  it("reads a stored value over prefers(), in either direction", () => {
    const storage = memoryStorage({
      [hostSettingsStorageKey]: JSON.stringify({ v: 1, reducedMotion: true }),
    });
    expect(
      readReducedMotion(
        storage,
        vi.fn<() => boolean>(() => false),
      ),
    ).toBe(true);
  });
});

describe("readSettings", () => {
  it("falls back to the volume defaults and prefers() with nothing stored", () => {
    expect(
      readSettings(
        memoryStorage(),
        vi.fn<() => boolean>(() => false),
      ),
    ).toEqual({ ...defaultVolumes, reducedMotion: false });
  });

  it("reads a fully stored entry, so it survives across nights", () => {
    const storage = memoryStorage({
      [hostSettingsStorageKey]: JSON.stringify({
        v: 1,
        muted: true,
        music: 3,
        effects: 10,
        reducedMotion: true,
      }),
    });
    expect(
      readSettings(
        storage,
        vi.fn<() => boolean>(() => false),
      ),
    ).toEqual({ muted: true, music: 3, effects: 10, reducedMotion: true });
  });
});

describe("writeSettings", () => {
  it("persists the entry under the shared key and applies the volumes to audio", () => {
    const setVolumes = vi.spyOn(audio, "setVolumes").mockImplementation(() => {});
    const storage = memoryStorage();
    const next = { muted: true, music: 2, effects: 5, reducedMotion: true };

    writeSettings(next, storage);

    expect(JSON.parse(storage.entries[hostSettingsStorageKey]!)).toEqual({ v: 1, ...next });
    expect(setVolumes).toHaveBeenCalledWith({ muted: true, music: 2, effects: 5 });
  });

  it("still applies to audio when storage is blocked, so muting works this session", () => {
    const setVolumes = vi.spyOn(audio, "setVolumes").mockImplementation(() => {});
    const blocked: HostSettingsWritableStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const next = { muted: false, music: 6, effects: 8, reducedMotion: false };

    writeSettings(next, blocked);

    expect(setVolumes).toHaveBeenCalledWith({ muted: false, music: 6, effects: 8 });
  });

  it("still applies to audio when there is no storage at all", () => {
    const setVolumes = vi.spyOn(audio, "setVolumes").mockImplementation(() => {});
    const next = { muted: true, music: 0, effects: 0, reducedMotion: false };

    writeSettings(next, null);

    expect(setVolumes).toHaveBeenCalledWith({ muted: true, music: 0, effects: 0 });
  });
});
