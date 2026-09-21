import { describe, expect, it } from "vitest";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { BodyState } from "@couchcade/physics";
import { ballId, doublesSlots, netHeight, soloSlots } from "../src/shared/constants.ts";
import {
  applyFloorBounceDrag,
  netPresent,
  predict,
  stepBallPlan,
  stepHeight,
} from "../src/shared/physics.ts";

const dtSeconds = tickMs / 1000;

interface Shot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface ShotResult {
  /** ms and height the first time `y` reaches the net line. */
  netCrossMs: number | null;
  netCrossZ: number | null;
  /** ms and `y` of the first floor bounce (the landing). */
  landedMs: number | null;
  landedY: number | null;
}

/** Steps a ball exactly the way `onTick` does, for the worked numbers in the spec. */
function simulateShot(start: Shot, maxSteps = 200): ShotResult {
  let body: BodyState = {
    id: ballId,
    x: start.x,
    y: start.y,
    vx: start.vx,
    vy: start.vy,
    a: 0,
    w: 0,
  };
  let z = start.z;
  let vz = start.vz;
  let netCrossMs: number | null = null;
  let netCrossZ: number | null = null;
  let landedMs: number | null = null;
  let landedY: number | null = null;

  for (let step = 0; step < maxSteps; step++) {
    const planStep = stepBallPlan(body, z);
    const heightStep = stepHeight(z, vz, dtSeconds);
    body = planStep.body;
    z = heightStep.z;
    vz = heightStep.vz;
    if (heightStep.bounced) {
      body = applyFloorBounceDrag(body);
      if (landedMs === null) {
        landedMs = (step + 1) * tickMs;
        landedY = body.y;
      }
    }
    if (netCrossMs === null && body.y >= 10) {
      netCrossMs = (step + 1) * tickMs;
      netCrossZ = z;
    }
  }
  return { netCrossMs, netCrossZ, landedMs, landedY };
}

describe("netHeight (Court, ball and walls)", () => {
  it("is 0.88 m at the centre and 0.92 m at the ends", () => {
    expect(netHeight(5)).toBeCloseTo(0.88, 5);
    expect(netHeight(0)).toBeCloseTo(0.92, 5);
    expect(netHeight(10)).toBeCloseTo(0.92, 5);
  });
});

describe("netPresent", () => {
  it("is a wall only while the ball is below the net's height there", () => {
    expect(netPresent(0.5, 5)).toBe(true);
    expect(netPresent(1.5, 5)).toBe(false);
  });
});

/**
 * The worked numbers in docs/games/bandeja.md ("Swing timing and shots", "Worked numbers"), run
 * for real through the rules' own physics functions, as ranges, the way Strike Night keeps its
 * prototype targets.
 */
describe("worked numbers", () => {
  it("a clean drive from a-right, aim 0: crosses the net at ~0.26 s, ~1.3 m, lands at ~11.8 m", () => {
    // a-right (7.4, 6.4), contact at 0.8 m, aim 0: 14 m/s plan speed, 3.2 m/s lift.
    const result = simulateShot({ x: 7.4, y: 6.4, z: 0.8, vx: 0, vy: 14, vz: 3.2 });
    expect(result.netCrossMs).not.toBeNull();
    expect((result.netCrossMs as number) / 1000).toBeGreaterThan(0.2);
    expect((result.netCrossMs as number) / 1000).toBeLessThan(0.32);
    expect(result.netCrossZ).not.toBeNull();
    expect(result.netCrossZ as number).toBeGreaterThan(1.1);
    expect(result.netCrossZ as number).toBeLessThan(1.5);

    expect(result.landedMs).not.toBeNull();
    expect((result.landedMs as number) / 1000).toBeGreaterThan(0.75);
    expect((result.landedMs as number) / 1000).toBeLessThan(0.95);
    expect(result.landedY).not.toBeNull();
    // "Lands 11.83 m away at y = 18.2, 1.8 m short of the back glass" (y = 20).
    expect(result.landedY as number).toBeGreaterThan(17.3);
    expect(result.landedY as number).toBeLessThan(19.2);
  });

  it("a mishit off a low ball finds the net", () => {
    // Contact at 0.8 m, mishit grade: 7 m/s, 1.4 m/s lift.
    const result = simulateShot({ x: 7.4, y: 6.4, z: 0.8, vx: 0, vy: 7, vz: 1.4 });
    // "Reaches the net line 0.51 s later at 0.22 m, against a net 0.89 m high there. Into the net."
    // netPresent already keeps the net a wall well below that height, so the ball never crosses.
    expect(result.netCrossMs).toBeNull();
  });

  it("a mishit off a high ball clears the net but sits up short of it", () => {
    // Contact at 1.8 m, mishit grade: 7 m/s, 1.4 m/s lift.
    const result = simulateShot({ x: 7.4, y: 6.4, z: 1.8, vx: 0, vy: 7, vz: 1.4 });
    expect(result.netCrossMs).not.toBeNull();
    // "Clears the net at 1.22 m but lands at y = 11.8, a sitter just over the net."
    expect(result.netCrossZ as number).toBeGreaterThan(1.0);
    expect(result.landedY as number).toBeGreaterThan(11.0);
    expect(result.landedY as number).toBeLessThan(13.0);
  });
});

describe("predict (Look-ahead)", () => {
  it("finds the closest-approach arrival, not just the first moment in reach", () => {
    // The same clean drive passes straight through b-right's reach at (7.4, 13.6): closest
    // approach is exactly at its home spot, ~0.51 s in (spec: "0.51 s in and 1.15 m up").
    const leg = predict(
      { x: 7.4, y: 6.4, z: 0.8, vx: 0, vy: 14, vz: 3.2 },
      tickMs,
      0,
      doublesSlots,
    );
    const arriveAt = leg.arrivals["b-right"];
    expect(arriveAt).toBeDefined();
    expect((arriveAt as number) / 1000).toBeGreaterThan(0.44);
    expect((arriveAt as number) / 1000).toBeLessThan(0.58);
  });

  it("gives no arrival to a slot the ball never reaches", () => {
    const leg = predict(
      { x: 7.4, y: 6.4, z: 0.8, vx: 0, vy: 14, vz: 3.2 },
      tickMs,
      0,
      doublesSlots,
    );
    expect(leg.arrivals["a-left"]).toBeUndefined();
  });

  it("never gives an arrival to a slot outside the passed slot set", () => {
    // b-right is a real slot on the court, but a singles match's `soloSlots` doesn't use it: a
    // ball headed straight for it must not register there when only the solo slots are passed.
    const leg = predict({ x: 7.4, y: 6.4, z: 0.8, vx: 0, vy: 14, vz: 3.2 }, tickMs, 0, soloSlots);
    expect(leg.arrivals["b-right"]).toBeUndefined();
  });
});
