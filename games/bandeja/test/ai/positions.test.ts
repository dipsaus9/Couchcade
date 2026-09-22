import { describe, expect, it } from "vitest";
import { tickMs } from "@couchcade/game-sdk/contract";
import { ballId, doublesSlots } from "../../src/shared/constants.ts";
import { nextPosition } from "../../src/shared/ai/positions.ts";
import type { BallState } from "../../src/shared/state.ts";

const aRight = doublesSlots.find((spec) => spec.slot === "a-right");
if (aRight === undefined) throw new Error("a-right must exist");

/**
 * `nextPosition` reads its target straight off `ball.landing` (cached by `rules.ts` at the same
 * path-change events `leg` is - see `ai/positions.ts`'s own doc comment), so these tests supply it
 * directly rather than deriving it from a real trajectory: `ai/landing.test.ts` already covers
 * whether `predictLanding` itself gets the physics right. `body`/`z`/`vz` are still filled in for a
 * realistic `BallState`, even though `nextPosition` doesn't read them.
 */
function ball(landing: BallState["landing"]): BallState {
  return {
    body: { id: ballId, x: 5, y: 10, vx: 0, vy: 0, a: 0, w: 0 },
    z: 0.5,
    vz: 0,
    leg: { arrivals: {}, timedOut: [] },
    landing,
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

  it("drifts back to home when a ball's live but can't be landed inside the horizon", () => {
    const next = nextPosition(aRight, [8.5, 8.0], ball(null), tickMs);
    expect(next[0]).toBeLessThan(8.5);
    expect(next[0]).toBeGreaterThan(7.4);
  });

  it("walks toward the ball's predicted landing spot while a ball's live", () => {
    // A landing spot to the left of a-right's home (7.4, 6.4): the slot should step left to meet
    // it.
    const inFlight = ball({ x: 3.9, y: 3.7, tMs: 850 });
    const next = nextPosition(aRight, aRight.home, inFlight, tickMs);
    expect(next[0]).toBeLessThan(aRight.home[0]);
  });

  it("never moves the slot outside its own reach circle, however far the ball lands", () => {
    // A landing spot far outside a-right's 2.4 m reach of (7.4, 6.4).
    const inFlight = ball({ x: 9.9, y: 19.9, tMs: 20 });
    let position = aRight.home;
    for (let i = 0; i < 600; i++) position = nextPosition(aRight, position, inFlight, tickMs);
    const distance = Math.hypot(position[0] - aRight.home[0], position[1] - aRight.home[1]);
    expect(distance).toBeLessThanOrEqual(aRight.reach + 1e-9);
  });
});
