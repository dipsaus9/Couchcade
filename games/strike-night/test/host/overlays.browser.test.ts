import { describe, expect, it } from "vitest";
import type { FrameRecord } from "../../src/shared/index.ts";
import { frameCellText } from "../../src/host/overlays.ts";

const frame = (patch: Partial<FrameRecord> = {}): FrameRecord => ({
  roll1: null,
  roll2: null,
  score: null,
  ...patch,
});

describe("frameCellText: docs/games/strike-night.md, Rules and scoring, Mark on the TV", () => {
  it("is blank before roll 1", () => {
    expect(frameCellText(frame())).toBe("");
  });

  it("is X for a strike", () => {
    expect(frameCellText(frame({ roll1: 10, score: 30 }))).toBe("X");
  });

  it("is '7 /' for a spare: roll 1's pins, then a slash", () => {
    expect(frameCellText(frame({ roll1: 7, roll2: 3, score: 17 }))).toBe("7 /");
  });

  it("is '7 2' for an open frame: both rolls", () => {
    expect(frameCellText(frame({ roll1: 7, roll2: 2, score: 9 }))).toBe("7 2");
  });

  it("shows a gutter roll as '-' in either position", () => {
    expect(frameCellText(frame({ roll1: 0, roll2: 4, score: 4 }))).toBe("- 4");
    expect(frameCellText(frame({ roll1: 6, roll2: 0, score: 6 }))).toBe("6 -");
  });

  it("shows just roll 1 while roll 2 hasn't happened yet", () => {
    expect(frameCellText(frame({ roll1: 4, roll2: null, score: null }))).toBe("4");
    expect(frameCellText(frame({ roll1: 0, roll2: null, score: null }))).toBe("-");
  });
});
