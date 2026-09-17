import { afterEach, describe, expect, it, vi } from "vitest";
import { canVibrate, haptic, hapticPatterns } from "../../src/haptics/index.ts";

/** docs/architecture/audio.md, "Phone haptics": one pattern per cue, never required. */
describe("haptics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("reports vibration support from Navigator.vibrate", () => {
    // Real Chromium (this package's tests run in a browser, not jsdom) already has
    // Navigator.vibrate on its prototype, so the "unsupported" case is stubbed explicitly rather
    // than assumed from a fresh environment.
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
    expect(canVibrate()).toBe(false);
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn<Navigator["vibrate"]>(),
      configurable: true,
    });
    expect(canVibrate()).toBe(true);
  });

  it("does nothing where Navigator.vibrate isn't available", () => {
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
    expect(() => haptic("press")).not.toThrow();
  });

  it.each([
    ["press", hapticPatterns.press],
    ["your-turn", hapticPatterns["your-turn"]],
    ["celebrate", hapticPatterns.celebrate],
    ["foul", hapticPatterns.foul],
  ] as const)("plays %s as %j", (cue, pattern) => {
    const vibrate = vi.fn<Navigator["vibrate"]>();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    haptic(cue);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(pattern);
  });

  it("swallows a throwing Navigator.vibrate, since haptics are a bonus, never required", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: () => {
        throw new Error("not allowed in this context");
      },
      configurable: true,
    });
    expect(() => haptic("celebrate")).not.toThrow();
  });
});
