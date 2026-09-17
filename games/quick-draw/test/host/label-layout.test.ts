import { describe, expect, it } from "vitest";
import { labelGap, overlaps, placeTags, tagBox } from "../../src/host/label-layout.ts";
import type { Box } from "../../src/host/label-layout.ts";

const tag = (x: number, bottom: number) => ({ x, bottom, width: 100, height: 50 });

describe("placeTags", () => {
  it("leaves tags over their Pips when nothing is in the way", () => {
    expect(placeTags([tag(100, 600), null, tag(400, 600)], [])).toEqual([
      { left: 50, top: 550, right: 150, bottom: 600 },
      null,
      { left: 350, top: 550, right: 450, bottom: 600 },
    ]);
  });

  it("lifts a tag straight up over a BANG! it would cover, keeping the gap", () => {
    const bang: Box = { left: 120, top: 520, right: 240, bottom: 580 };
    const [box] = placeTags([tag(100, 600)], [bang]);
    expect(box).toEqual({ left: 50, top: 520 - labelGap - 50, right: 150, bottom: 520 - labelGap });
    expect(overlaps(box as Box, bang, labelGap)).toBe(false);
  });

  it("places the front row first and stacks a later tag over an earlier one", () => {
    const [back, front] = placeTags([tag(120, 580), tag(100, 600)], []);
    expect(front).toEqual(tagBox(tag(100, 600)));
    expect(back?.bottom).toBe(550 - labelGap);
  });

  it("keeps moving up until it is clear of every box", () => {
    const flags: Box[] = [
      { left: 0, top: 560, right: 200, bottom: 620 },
      { left: 0, top: 480, right: 200, bottom: 540 },
    ];
    const [box] = placeTags([tag(100, 600)], flags);
    expect(box?.bottom).toBe(480 - labelGap);
    for (const flag of flags) expect(overlaps(box as Box, flag, labelGap)).toBe(false);
  });
});

describe("overlaps", () => {
  it("counts boxes that only touch as apart, unless they are within the gap", () => {
    const a: Box = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(overlaps(a, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false);
    expect(overlaps(a, { left: 12, top: 0, right: 20, bottom: 10 }, 4)).toBe(true);
    expect(overlaps(a, { left: 5, top: 5, right: 20, bottom: 20 })).toBe(true);
  });
});
