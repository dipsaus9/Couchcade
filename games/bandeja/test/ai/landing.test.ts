import { describe, expect, it } from "vitest";
import { tickMs } from "@couchcade/game-sdk/contract";
import { predictSteps } from "../../src/shared/constants.ts";
import { predictLanding } from "../../src/shared/ai/landing.ts";

/**
 * Landing prediction (docs/games/bandeja.md, "Look-ahead"; CC-23.8's acceptance criterion 3). The
 * worked numbers themselves come from `physics.test.ts`'s own "worked numbers" describe block,
 * which already steps this exact drive to its first floor bounce (`landedMs`/`landedY`) by hand;
 * these tests check `predictLanding` reaches the same answer through the function CC-23.8 actually
 * ships, plus its own edge cases (a resting ball, an out-of-horizon flight).
 */
describe("predictLanding", () => {
  it("finds the same landing as the clean drive's worked numbers: ~11.8 m out, ~0.85 s", () => {
    // physics.test.ts: "Lands 11.83 m away at y = 18.2, 1.8 m short of the back glass," landing
    // between 0.75 s and 0.95 s.
    const landing = predictLanding(
      { x: 7.4, y: 6.4, z: 0.8, vx: 0, vy: 14, vz: 3.2 },
      tickMs,
      predictSteps,
    );
    expect(landing).not.toBeNull();
    expect((landing as { tMs: number }).tMs / 1000).toBeGreaterThan(0.75);
    expect((landing as { tMs: number }).tMs / 1000).toBeLessThan(0.95);
    expect((landing as { y: number }).y).toBeGreaterThan(17.3);
    expect((landing as { y: number }).y).toBeLessThan(19.2);
  });

  it("a ball already resting on the floor lands at once", () => {
    // Away from the net line (y = 10) and any wall, so the resolving contact is pure gravity, not
    // also a collision nudge.
    const landing = predictLanding(
      { x: 5, y: 6, z: 0, vx: 0, vy: 0, vz: -0.01 },
      tickMs,
      predictSteps,
    );
    expect(landing).not.toBeNull();
    expect((landing as { tMs: number }).tMs).toBe(tickMs);
    expect((landing as { x: number }).x).toBeCloseTo(5, 2);
    expect((landing as { y: number }).y).toBeCloseTo(6, 2);
  });

  it("returns null when the ball can't land inside the given horizon", () => {
    // A tiny horizon (1 step) is nowhere near enough for a ball that starts 2 m up.
    const landing = predictLanding({ x: 5, y: 10, z: 2, vx: 0, vy: 0, vz: 0 }, tickMs, 1);
    expect(landing).toBeNull();
  });

  it("a shot heading for a side wall still lands - the wall bends its path, it doesn't end it", () => {
    // Fired straight at the left wall (x = 0) with plenty of lift: `stepBallPlan` rebounds it off
    // the corner glass in plan view well before height brings it down, so the landing spot it
    // finds is still on the court, not off the edge of it.
    const landing = predictLanding(
      { x: 0.5, y: 6.4, z: 0.8, vx: -8, vy: 3, vz: 3.2 },
      tickMs,
      predictSteps,
    );
    expect(landing).not.toBeNull();
    const { x, y } = landing as { x: number; y: number };
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(10);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(20);
  });
});
