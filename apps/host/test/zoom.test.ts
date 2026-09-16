import { describe, expect, it } from "vitest";
import { integerZoom } from "../src/stage/zoom.ts";

describe("integerZoom", () => {
  it.each([
    [1920, 1080, 4],
    [3840, 2160, 8],
    [1280, 720, 2],
    [1440, 900, 3],
    [1919, 1080, 3],
    [2560, 1080, 4],
    [300, 200, 1],
  ])("fits the 480x270 world into %i x %i at x%i", (width, height, zoom) => {
    expect(integerZoom(width, height)).toBe(zoom);
  });
});
