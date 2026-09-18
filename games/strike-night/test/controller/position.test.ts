import { describe, expect, it } from "vitest";
import { positionOf } from "../../src/controller/position.ts";

describe("positionOf: docs/games/strike-night.md, Lining up", () => {
  it("maps the slider's 0..1 to -1..1", () => {
    expect(positionOf(0)).toBe(-1);
    expect(positionOf(0.5)).toBe(0);
    expect(positionOf(1)).toBe(1);
  });

  it("clamps out-of-range slider values", () => {
    expect(positionOf(-1)).toBe(-1);
    expect(positionOf(2)).toBe(1);
  });

  it("rounds to 0.05, the 41 spots about 2 cm apart", () => {
    // x = 0.03: closer to the spot at 0.05 than to 0.
    expect(positionOf(0.515)).toBe(0.05);
    // x = 0.01: closer to the spot at 0.
    expect(positionOf(0.505)).toBe(0);
    expect(positionOf(0.73)).toBe(0.45);
  });

  it("never returns -0", () => {
    expect(Object.is(positionOf(0.5), -0)).toBe(false);
  });
});
