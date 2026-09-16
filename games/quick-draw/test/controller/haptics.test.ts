import { afterEach, describe, expect, it, vi } from "vitest";
import { canVibrate, playCue } from "../../src/controller/haptics.ts";

/** docs/HOUSE_STYLE.md, "Motion, sound and haptics": one pattern per cue, never required. */
describe("haptics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("reports vibration support from Navigator.vibrate", () => {
    expect(canVibrate()).toBe(false);
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn<Navigator["vibrate"]>(),
      configurable: true,
    });
    expect(canVibrate()).toBe(true);
  });

  it("does nothing where Navigator.vibrate isn't available", () => {
    expect(() => playCue("press")).not.toThrow();
  });

  it.each([
    ["press", 10],
    ["your-turn", [40, 40, 40]],
    ["celebrate", 120],
    ["foul", [50, 50, 50, 50, 50]],
  ] as const)("plays %s as %j", (cue, pattern) => {
    const vibrate = vi.fn<Navigator["vibrate"]>();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    playCue(cue);
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
    expect(() => playCue("celebrate")).not.toThrow();
  });
});
