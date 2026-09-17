import { audio, defaultVolumes } from "@couchcade/audio";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyHostSettings,
  hostSettingsStorageKey,
  readVolumes,
  type HostSettingsStorage,
} from "../../src/audio/host-settings.ts";

/** An in-memory Web Storage, like packages/game-sdk's display-lag test. */
function memoryStorage(entries: Record<string, string> = {}): HostSettingsStorage & {
  entries: Record<string, string>;
} {
  return {
    entries,
    getItem: (key) => entries[key] ?? null,
  };
}

const blocked: HostSettingsStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readVolumes", () => {
  it("falls back to the defaults with nothing stored", () => {
    expect(readVolumes(memoryStorage())).toEqual(defaultVolumes);
  });

  it("falls back to the defaults without any storage", () => {
    expect(readVolumes(null)).toEqual(defaultVolumes);
    vi.stubGlobal("localStorage", undefined);
    expect(readVolumes()).toEqual(defaultVolumes);
  });

  it("falls back to the defaults when storage is blocked", () => {
    expect(readVolumes(blocked)).toEqual(defaultVolumes);
  });

  it("falls back to the defaults for a broken or older entry", () => {
    for (const raw of [
      "not json",
      "null",
      "80",
      '{"v":1,"muted":false,"music":6}',
      '{"v":1,"muted":"no","music":6,"effects":8}',
      '{"v":2,"muted":true,"music":0,"effects":0}',
    ]) {
      expect(readVolumes(memoryStorage({ [hostSettingsStorageKey]: raw }))).toEqual(defaultVolumes);
    }
  });

  it("reads a stored mute, so a muted laptop stays muted across nights", () => {
    const storage = memoryStorage({
      [hostSettingsStorageKey]: JSON.stringify({ v: 1, muted: true, music: 3, effects: 10 }),
    });
    expect(readVolumes(storage)).toEqual({ muted: true, music: 3, effects: 10 });
  });
});

describe("applyHostSettings", () => {
  it("applies the stored volumes to audio, so muting there silences everything", () => {
    const setVolumes = vi.spyOn(audio, "setVolumes").mockImplementation(() => {});
    const storage = memoryStorage({
      [hostSettingsStorageKey]: JSON.stringify({ v: 1, muted: true, music: 6, effects: 8 }),
    });

    applyHostSettings(storage);

    expect(setVolumes).toHaveBeenCalledOnce();
    expect(setVolumes).toHaveBeenCalledWith({ muted: true, music: 6, effects: 8 });
  });

  it("applies the defaults when nothing is stored yet", () => {
    const setVolumes = vi.spyOn(audio, "setVolumes").mockImplementation(() => {});
    applyHostSettings(memoryStorage());
    expect(setVolumes).toHaveBeenCalledWith(defaultVolumes);
  });
});
