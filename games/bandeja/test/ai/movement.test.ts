import { describe, expect, it } from "vitest";
import { clampToReach, stepToward } from "../../src/shared/ai/movement.ts";

describe("stepToward", () => {
  it("moves at most maxDistance toward the target", () => {
    const next = stepToward([0, 0], [10, 0], 3);
    expect(next[0]).toBeCloseTo(3, 5);
    expect(next[1]).toBeCloseTo(0, 5);
  });

  it("lands exactly on the target once it's within reach", () => {
    const next = stepToward([0, 0], [2, 0], 3);
    expect(next).toEqual([2, 0]);
  });

  it("moves diagonally, not just axis-aligned", () => {
    const next = stepToward([0, 0], [3, 4], 2.5); // a 3-4-5 triangle, half the distance
    expect(next[0]).toBeCloseTo(1.5, 5);
    expect(next[1]).toBeCloseTo(2, 5);
  });

  it("is a no-op already at the target", () => {
    const next = stepToward([5, 5], [5, 5], 3);
    expect(next).toEqual([5, 5]);
  });
});

describe("clampToReach", () => {
  it("leaves a point inside the reach circle untouched", () => {
    const point = clampToReach([1, 1], [0, 0], 2);
    expect(point).toEqual([1, 1]);
  });

  it("pulls a point outside the reach circle back to its edge", () => {
    const point = clampToReach([10, 0], [0, 0], 2.4);
    expect(point[0]).toBeCloseTo(2.4, 5);
    expect(point[1]).toBeCloseTo(0, 5);
  });

  it("clamps toward home from any direction", () => {
    const point = clampToReach([2.6, 20], [2.6, 13.6], 2.4); // b-left's home, straight down-court
    expect(point[0]).toBeCloseTo(2.6, 5);
    expect(point[1]).toBeCloseTo(16, 5); // 13.6 + 2.4
  });
});
