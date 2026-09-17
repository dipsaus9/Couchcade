import { describe, expect, it } from "vitest";
import { overlaps, placeShapes, placeTagsBelow, stubBox } from "../../src/host/label-layout.ts";
import type { Box } from "../../src/host/label-layout.ts";
import { shapeBounds } from "../../src/host/layout.ts";

const pairs = <T>(list: readonly T[]): [T, T][] =>
  list.flatMap((a, i) => list.slice(i + 1).map((b): [T, T] => [a, b]));

describe("placeShapes", () => {
  it("puts a lone shape at the stub's top right, touching it", () => {
    expect(placeShapes([{ x: 240, y: 140 }], [{ x: 240, y: 140 }], shapeBounds)).toEqual([
      { left: 243, top: 129, right: 252, bottom: 138 },
    ]);
  });

  it("keeps 8 shapes off each other and off every stub when the arrows land close together", () => {
    // 8 arrows within 6 px of the centre, the way a good volley lands on the near target, plus
    // 8 older stubs around them.
    const newest = Array.from({ length: 8 }, (_, seat) => ({
      x: 240 + Math.round(Math.cos(seat * 0.8) * (2 + (seat % 3) * 2)),
      y: 140 + Math.round(Math.sin(seat * 0.8) * (2 + (seat % 3) * 2)),
    }));
    const older = Array.from({ length: 8 }, (_, seat) => ({
      x: 240 + Math.round(Math.cos(seat) * 12),
      y: 140 + Math.round(Math.sin(seat) * 12),
    }));
    const shapes = placeShapes(newest, [...older, ...newest], shapeBounds);
    const stubs = [...older, ...newest].map((stub) => stubBox(stub.x, stub.y));
    for (const [a, b] of pairs(shapes)) expect(overlaps(a, b)).toBe(false);
    for (const shape of shapes) {
      for (const stub of stubs) expect(overlaps(shape, stub)).toBe(false);
      expect(shape.top).toBeGreaterThanOrEqual(shapeBounds.top);
    }
  });

  it("stays below the scoreboard for an arrow at the top edge", () => {
    const [shape] = placeShapes([{ x: 240, y: 38 }], [{ x: 240, y: 38 }], shapeBounds);
    expect(shape?.top).toBeGreaterThanOrEqual(shapeBounds.top);
  });
});

describe("placeTagsBelow", () => {
  it("keeps tags under their chips and moves one down a row when it would touch its neighbour", () => {
    const tags = placeTagsBelow(
      [
        { x: 300, top: 156, width: 80, height: 60 },
        null,
        { x: 360, top: 156, width: 80, height: 60 },
        { x: 600, top: 156, width: 80, height: 60 },
      ],
      12,
    );
    expect(tags[1]).toBeNull();
    expect(tags[0]).toEqual({ left: 260, top: 156, right: 340, bottom: 216 });
    expect(tags[2]).toEqual({ left: 320, top: 228, right: 400, bottom: 288 });
    expect(tags[3]).toEqual({ left: 560, top: 156, right: 640, bottom: 216 });
    const shown = tags.filter((tag): tag is Box => tag !== null);
    for (const [a, b] of pairs(shown)) expect(overlaps(a, b, 12)).toBe(false);
  });
});
