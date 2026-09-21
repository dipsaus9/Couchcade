import { describe, expect, it } from "vitest";
import { tickMs } from "@couchcade/game-sdk/contract";
import { ballId, doublesSlots } from "../../src/shared/constants.ts";
import { nextPosition } from "../../src/shared/ai/positions.ts";
import type { BallState } from "../../src/shared/state.ts";

const aRight = doublesSlots.find((spec) => spec.slot === "a-right");
if (aRight === undefined) throw new Error("a-right must exist");

function ball(x: number, y: number, z: number, vx: number, vy: number, vz: number): BallState {
  return {
    body: { id: ballId, x, y, vx, vy, a: 0, w: 0 },
    z,
    vz,
    leg: { arrivals: {}, timedOut: [] },
  };
}

describe("nextPosition", () => {
  it("drifts back to home when there's no ball in flight", () => {
    const next = nextPosition(aRight, [8.5, 8.0], null, tickMs);
    // 3.5 m/s at 60 Hz moves it a small, real step toward home (7.4, 6.4), not all the way there.
    expect(next[0]).toBeLessThan(8.5);
    expect(next[1]).toBeLessThan(8.0);
    expect(next[0]).toBeGreaterThan(7.4);
  });

  it("is already home and stays there once the ball's gone", () => {
    const next = nextPosition(aRight, aRight.home, null, tickMs);
    expect(next).toEqual(aRight.home);
  });

  it("walks toward the ball's predicted landing spot while a ball's live", () => {
    // A ball crossing a-right's side of the court (y < 10) heading left, from (9.0, 2.0) at
    // 6 m/s leftward: it lands well to the left of a-right's home (7.4, 6.4), so the slot should
    // step left to meet it.
    const inFlight = ball(9.0, 2.0, 0.8, -6, 2, 3.2);
    const next = nextPosition(aRight, aRight.home, inFlight, tickMs);
    expect(next[0]).toBeLessThan(aRight.home[0]);
  });

  it("never moves the slot outside its own reach circle, however far the ball lands", () => {
    // A landing spot far outside a-right's 2.4 m reach of (7.4, 6.4).
    const inFlight = ball(9.9, 19.9, 0.05, 0, 0, -0.01);
    let position = aRight.home;
    for (let i = 0; i < 600; i++) position = nextPosition(aRight, position, inFlight, tickMs);
    const distance = Math.hypot(position[0] - aRight.home[0], position[1] - aRight.home[1]);
    expect(distance).toBeLessThanOrEqual(aRight.reach + 1e-9);
  });
});
