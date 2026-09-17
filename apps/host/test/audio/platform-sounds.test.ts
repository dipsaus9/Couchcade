import { audio, soundTokens } from "@couchcade/audio";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lobbyLoop,
  platformTokens,
  registerPlatformSounds,
} from "../../src/audio/platform-sounds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("platformTokens", () => {
  it("has exactly the six house style tokens, each with a src, bus and visual", () => {
    expect(Object.keys(platformTokens.refs).toSorted()).toEqual([...soundTokens].toSorted());
    for (const token of soundTokens) {
      const ref = platformTokens.refs[token];
      expect(ref.owner).toBe("platform");
      expect(ref.def.bus).toBe("effects");
      expect(ref.def.src.endsWith(`audio/${token}.ogg`)).toBe(true);
      expect(ref.def.visual.length).toBeGreaterThan(0);
    }
  });
});

describe("lobbyLoop", () => {
  it("is a looping music ref pointing at lobby-loop.ogg", () => {
    expect(lobbyLoop.owner).toBe("platform");
    expect(lobbyLoop.def.bus).toBe("music");
    expect(lobbyLoop.def.loop).toBe(true);
    expect(lobbyLoop.def.src.endsWith("audio/lobby-loop.ogg")).toBe(true);
  });
});

describe("registerPlatformSounds", () => {
  it("registers the tokens and starts loading both banks", () => {
    const setTokens = vi.spyOn(audio, "setTokens").mockImplementation(() => {});
    const load = vi.spyOn(audio, "load").mockResolvedValue(undefined);

    registerPlatformSounds();

    expect(setTokens).toHaveBeenCalledOnce();
    expect(setTokens).toHaveBeenCalledWith(platformTokens);
    expect(load).toHaveBeenCalledTimes(2);
    const loadedBanks = load.mock.calls.map(([bank]) => bank);
    expect(loadedBanks).toContainEqual(platformTokens);
    expect(loadedBanks.some((bank) => Object.keys(bank.refs).includes("lobbyLoop"))).toBe(true);
  });
});
