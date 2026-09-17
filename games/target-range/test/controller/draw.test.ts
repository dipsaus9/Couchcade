import { describe, expect, it } from "vitest";
import { fullDrawPx, powerOf, shoots } from "../../src/controller/draw.ts";

describe("powerOf", () => {
  it("grows with the pull and is full at a firm 150 px", () => {
    expect(fullDrawPx).toBe(150);
    expect(powerOf(0)).toBe(0);
    expect(powerOf(45)).toBe(0.3);
    expect(powerOf(75)).toBe(0.5);
    expect(powerOf(149)).toBe(0.99);
    expect(powerOf(150)).toBe(1);
  });

  it("adds nothing past 150 px and nothing for a pull upwards", () => {
    expect(powerOf(400)).toBe(1);
    expect(Object.is(powerOf(-60), 0)).toBe(true);
  });

  it("rounds to 2 decimals", () => {
    expect(powerOf(100)).toBe(0.67);
  });
});

describe("shoots", () => {
  it("shoots from 0.3 and lowers the bow below it", () => {
    expect(shoots(0.29)).toBe(false);
    expect(shoots(0.3)).toBe(true);
    expect(shoots(1)).toBe(true);
  });
});
