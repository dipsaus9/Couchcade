import { describe, expect, it } from "vitest";
import {
  hexToRgb,
  nearestPaletteColor,
  oklabDistance,
  rgbToHex,
  rgbToOklab,
  toPaletteEntries,
} from "../src/color-distance.ts";

describe("hexToRgb / rgbToHex", () => {
  it("round-trips the core Ink colour", () => {
    expect(hexToRgb("#1E2A4A")).toEqual({ r: 0x1e, g: 0x2a, b: 0x4a });
    expect(rgbToHex({ r: 0x1e, g: 0x2a, b: 0x4a })).toBe("#1E2A4A");
  });

  it("is case-insensitive on the way in and upper case on the way out", () => {
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe("#FFFFFF");
  });

  it("throws on anything but #RRGGBB", () => {
    expect(() => hexToRgb("blue")).toThrow(/RRGGBB/);
    expect(() => hexToRgb("#FFF")).toThrow(/RRGGBB/);
  });
});

describe("rgbToOklab / oklabDistance", () => {
  it("gives identical colours zero distance", () => {
    const a = rgbToOklab({ r: 30, g: 42, b: 74 });
    const b = rgbToOklab({ r: 30, g: 42, b: 74 });
    expect(oklabDistance(a, b)).toBe(0);
  });

  it("gives black and white the largest distance in a small set", () => {
    const black = rgbToOklab({ r: 0, g: 0, b: 0 });
    const white = rgbToOklab({ r: 255, g: 255, b: 255 });
    const grey = rgbToOklab({ r: 128, g: 128, b: 128 });
    expect(oklabDistance(black, white)).toBeGreaterThan(oklabDistance(black, grey));
    expect(oklabDistance(black, white)).toBeGreaterThan(oklabDistance(grey, white));
  });
});

describe("nearestPaletteColor", () => {
  const palette = toPaletteEntries(["#000000", "#FF0000", "#0000FF"]);

  it("picks the exact match when it's in the palette", () => {
    expect(nearestPaletteColor({ r: 255, g: 0, b: 0 }, palette).hex).toBe("#FF0000");
  });

  it("picks red over blue for a colour that's clearly reddish", () => {
    expect(nearestPaletteColor({ r: 220, g: 40, b: 30 }, palette).hex).toBe("#FF0000");
  });

  it("picks blue over red for a colour that's clearly bluish", () => {
    expect(nearestPaletteColor({ r: 20, g: 30, b: 210 }, palette).hex).toBe("#0000FF");
  });

  it("throws on an empty palette", () => {
    expect(() => nearestPaletteColor({ r: 0, g: 0, b: 0 }, [])).toThrow(/empty/);
  });
});
