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
    expect(lobbyLoop.def.src.endsWith("audio/lobby-loop.ogg")).toBe(true);
  });

  it("loops sample-accurate startS/endS points, not the whole file (CC-7.7)", () => {
    // The file carries extra tail audio past endS on purpose (apps/host/CREDITS.md), so this
    // isn't `loop: true` over the whole buffer.
    expect(lobbyLoop.def.loop).toEqual({ startS: 0.030204, endS: 22.178821 });
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
