import { describe, expect, it } from "vitest";
import { createRng } from "@couchcade/utils";
import {
  aimPoint,
  arrowPoints,
  flyArrow,
  rollTarget,
  rollWind,
  roundRules,
  rounds,
} from "../src/shared/index.ts";

const still = { yaw: 0, pitch: 0 };

describe("arrow flight", () => {
  it("maps aim to the world: home at (240, 140), full yaw 200 px, full pitch 90 px", () => {
    expect(aimPoint(still)).toEqual({ x: 240, y: 140 });
    expect(aimPoint({ yaw: 1, pitch: 1 })).toEqual({ x: 440, y: 50 });
    expect(aimPoint({ yaw: -1, pitch: -1 })).toEqual({ x: 40, y: 230 });
  });

  it("drops a full draw by the round's drop and flies for its base time", () => {
    expect(rounds.map((round) => flyArrow(round, still, 1, 0))).toEqual([
      { x: 240, y: 144, flightMs: 350 },
      { x: 240, y: 148, flightMs: 500 },
      { x: 240, y: 154, flightMs: 650 },
      { x: 240, y: 154, flightMs: 650 },
    ]);
  });

  it("flies a 30% draw 1.7 times longer, dropping 3 times and drifting 1.7 times as far", () => {
    const [near, middle, far] = rounds as [
      (typeof rounds)[0],
      (typeof rounds)[0],
      (typeof rounds)[0],
    ];
    expect(flyArrow(near, still, 0.3, 0).flightMs).toBe(603);
    expect(flyArrow(middle, still, 0.3, 0).flightMs).toBe(862);
    const weak = flyArrow(far, still, 0.3, 2);
    expect(weak.flightMs).toBe(1121);
    const stretch = 1121 / 650;
    expect(weak.y).toBe(Math.round((140 + 14 * stretch * stretch) * 10) / 10);
    expect(weak.x).toBe(Math.round((240 + 2 * 4 * stretch) * 10) / 10);
    expect(weak.y - 140).toBeGreaterThan(3 * 14 - 1);
  });

  it("pushes a full draw 16 px sideways in wind 4, right for positive and left for negative", () => {
    const gusty = roundRules(4);
    expect(flyArrow(gusty, still, 1, 4).x).toBe(256);
    expect(flyArrow(gusty, still, 1, -4).x).toBe(224);
    expect(flyArrow(roundRules(2), still, 1, 2).x).toBe(246);
  });

  it("rounds the landing point to 0.1 px", () => {
    const landing = flyArrow(roundRules(3), { yaw: 0.123, pitch: -0.456 }, 0.77, -3);
    expect(landing.x * 10).toBe(Math.round(landing.x * 10));
    expect(landing.y * 10).toBe(Math.round(landing.y * 10));
  });
});

describe("arrow score", () => {
  const target = { x: 200, y: 130 };

  it("scores ring k up to R × (11 − k) / 10 from the centre, and 0 outside the target", () => {
    // Near round: R = 36, so the 10 ring reaches 3.6 px and the 1 ring 36 px.
    expect(arrowPoints(target, 36, 200, 130)).toBe(10);
    expect(arrowPoints(target, 36, 203.6, 130)).toBe(10);
    expect(arrowPoints(target, 36, 203.7, 130)).toBe(9);
    expect(arrowPoints(target, 36, 200, 137.2)).toBe(9);
    expect(arrowPoints(target, 36, 200, 137.3)).toBe(8);
    expect(arrowPoints(target, 36, 164, 130)).toBe(1);
    expect(arrowPoints(target, 36, 163.9, 130)).toBe(0);
    expect(arrowPoints(target, 36, 440, 50)).toBe(0);
  });

  it("measures distance in both directions", () => {
    // (18, 24) is 30 px away: ring 2 of a 36 px target, the edge of a 30 px one, off a 24 px one.
    expect(arrowPoints(target, 36, 218, 154)).toBe(2);
    expect(arrowPoints(target, 30, 218, 154)).toBe(1);
    expect(arrowPoints(target, 24, 218, 154)).toBe(0);
  });

  it("gives every ring from 10 to 1 on a far target", () => {
    const scores = Array.from({ length: 11 }, (_, i) =>
      arrowPoints(target, 24, 200 + i * 2.4, 130),
    );
    expect(scores).toEqual([10, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
});

describe("target and wind rolls", () => {
  it("places targets on the 2 px grid in range, never within 6 px of a still full draw", () => {
    for (const round of rounds) {
      const rng = createRng(42);
      for (let i = 0; i < 3000; i++) {
        const { x, y } = rollTarget(rng, round);
        expect(x % 2).toBe(0);
        expect(y % 2).toBe(0);
        expect(x).toBeGreaterThanOrEqual(160);
        expect(x).toBeLessThanOrEqual(320);
        expect(y).toBeGreaterThanOrEqual(110);
        expect(y).toBeLessThanOrEqual(160);
        expect((x - 240) ** 2 + (y - 140 - round.dropPx) ** 2).toBeGreaterThan(36);
        // The whole face stays between y = 60 and y = 210.
        expect(y - round.radius).toBeGreaterThanOrEqual(60);
        expect(y + round.radius).toBeLessThanOrEqual(210);
      }
    }
  });

  it("rolls whole winds in each round's range, both directions, and calm in round 1", () => {
    const rng = createRng(7);
    const seen = rounds.map(
      (round) => new Set(Array.from({ length: 500 }, () => rollWind(rng, round))),
    );
    expect([...seen[0]!]).toEqual([0]);
    expect([...seen[1]!].toSorted((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    expect([...seen[2]!].toSorted((a, b) => a - b)).toEqual([-3, -2, -1, 1, 2, 3]);
    expect([...seen[3]!].toSorted((a, b) => a - b)).toEqual([-4, -3, -2, 2, 3, 4]);
  });
});
