import { describe, expect, it } from "vitest";
import { validateHole } from "../src/shared/hole.ts";
import type { Hole } from "../src/shared/hole.ts";
import { course } from "../src/shared/course.ts";
import { testHole } from "./helpers.ts";

const validHole: Hole = testHole();

describe("validateHole", () => {
  it("has no problems with a well-formed hole", () => {
    expect(validateHole(validHole)).toEqual([]);
  });

  it("passes every hole in the placeholder course (rule 2 to 6)", () => {
    for (const hole of course) expect(validateHole(hole), `hole ${hole.id}`).toEqual([]);
  });

  it("rejects bounds bigger than the TV's play area (rule 2)", () => {
    const problems = validateHole({
      ...validHole,
      bounds: [
        [0, 0],
        [11, 5],
      ],
    });
    expect(problems.some((p) => p.includes("m long"))).toBe(true);
  });

  it("rejects a tee too close to a wall (rule 3)", () => {
    const problems = validateHole({
      ...validHole,
      walls: [
        {
          points: [
            [0, 0.95],
            [2.6, 0.95],
          ],
          loop: false,
        },
      ],
    });
    expect(problems.some((p) => p.includes("tee"))).toBe(true);
  });

  it("rejects a captureRadius outside 0.05 to 0.10 (rule 4)", () => {
    expect(validateHole({ ...validHole, captureRadius: 0.2 }).length).toBeGreaterThan(0);
    expect(validateHole({ ...validHole, captureRadius: 0.01 }).length).toBeGreaterThan(0);
  });

  it("rejects a cup too close to a wall for its captureRadius (rule 4)", () => {
    const problems = validateHole({
      ...validHole,
      cup: [2.6, 0.15],
      captureRadius: 0.1,
      walls: [
        {
          points: [
            [2, 0],
            [3, 0],
          ],
          loop: false,
        },
      ],
    });
    expect(problems.some((p) => p.includes("cup is"))).toBe(true);
  });

  it("rejects a wall loop with fewer than 3 points (rule 5)", () => {
    const problems = validateHole({
      ...validHole,
      walls: [
        {
          points: [
            [0, 0],
            [1, 1],
          ],
          loop: true,
        },
      ],
    });
    expect(problems.some((p) => p.includes("needs at least"))).toBe(true);
  });

  it("rejects wall points closer than the minimum edge length (rule 5)", () => {
    const problems = validateHole({
      ...validHole,
      walls: [
        {
          points: [
            [0, 0],
            [0.001, 0],
            [1, 1],
          ],
          loop: true,
        },
      ],
    });
    expect(problems.some((p) => p.includes("too close"))).toBe(true);
  });

  it("rejects a par that isn't 2, 3 or 4 (rule 6)", () => {
    expect(validateHole({ ...validHole, par: 5 }).some((p) => p.includes("par"))).toBe(true);
    expect(validateHole({ ...validHole, par: 1 }).some((p) => p.includes("par"))).toBe(true);
  });
});
