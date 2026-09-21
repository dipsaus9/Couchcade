import { describe, expect, it } from "vitest";
import {
  autoPuttSpeedParam,
  bearingDeg,
  launchSpeed,
  resetSpot,
  startStroke,
  stepStroke,
  strokeLineDeg,
} from "../src/shared/physics.ts";
import { playStroke, testHole } from "./helpers.ts";

/**
 * The prototype and tuning targets from docs/games/putt-club.md, "Weight: what a swing is worth"
 * and "Worked numbers": the numbers as ranges, run for real through `@couchcade/physics` and this
 * story's rules (no hardcoded outcomes).
 */
describe("worked numbers", () => {
  it("speed 0.5 straight at a cup 2.6 m away holes out", () => {
    const hole = testHole({ cup: [2.6, 1], captureRadius: 0.07 });
    const stroke = playStroke(hole, { speed: 0.5 });
    expect(stroke.outcome).toBe("holed");
  });

  it("speed 0.8 straight at the same cup lips out and runs on", () => {
    const hole = testHole({ cup: [2.6, 1], captureRadius: 0.07 });
    const stroke = playStroke(hole, { speed: 0.8 });
    expect(stroke.outcome).not.toBe("holed");
    // Lips out well past CAPTURE_SPEED, loses a quarter of its pace and keeps rolling.
    expect(stroke.ball.x).toBeGreaterThan(2.6);
  });

  it("speed 0.0, the softest deliberate putt, rolls about 12 cm", () => {
    const hole = testHole({ cup: [50, 1] }); // far away: never holes, just rolls out
    const stroke = playStroke(hole, { speed: 0 });
    expect(stroke.ball.x).toBeCloseTo(0.12, 1);
  });

  it("launchSpeed and strokeLineDeg match the spec's formulas", () => {
    expect(launchSpeed(0)).toBeCloseTo(0.6, 10);
    expect(launchSpeed(1)).toBeCloseTo(5.0, 10);
    expect(launchSpeed(0.5)).toBeCloseTo(2.8, 10);

    expect(bearingDeg([0, 0], [1, 0])).toBeCloseTo(0, 10);
    // yaw 0 always means straight at the flag, whatever the bearing.
    expect(strokeLineDeg([0, 0], [1, 1], 0, 0)).toBeCloseTo(bearingDeg([0, 0], [1, 1]), 10);
    // A full +1 yaw adds the whole AIM_SPAN_DEG (75 degrees).
    expect(strokeLineDeg([0, 0], [1, 0], 1, 0)).toBeCloseTo(75, 10);
    // The swing's angle pushes at most PUSH_ANGLE_CLAMP_DEG (45) * PUSH_GAIN (0.04) = 1.8 degrees,
    // clamped beyond that.
    expect(strokeLineDeg([0, 0], [1, 0], 0, 45)).toBeCloseTo(1.8, 10);
    expect(strokeLineDeg([0, 0], [1, 0], 0, 180)).toBeCloseTo(1.8, 10);
  });

  it("autoPuttSpeedParam weights the auto-putt to stop 20% short", () => {
    const speed = autoPuttSpeedParam(3);
    const v = launchSpeed(speed);
    // v^2 = 2 * ROLL_DECEL * rollDistance, rollDistance = 3 * 0.8 = 2.4 m.
    expect((v * v) / (2 * 1.5)).toBeCloseTo(2.4, 1);
  });

  it("a putt straight into a kerb comes back off it, losing speed to restitution", () => {
    const hole = testHole({
      cup: [50, 1],
      walls: [
        {
          points: [
            [4, -5],
            [4, 5],
          ],
          loop: false,
          restitution: 0.5,
        },
      ],
    });
    const stroke = playStroke(hole, { speed: 1 });
    // Arrives at the kerb around 3.6 m/s, comes off around 1.8 m/s and rolls back about 1.1 m
    // (docs/games/putt-club.md, "Worked numbers"): well short of the kerb, well short of the 8.33 m
    // the same putt makes on open carpet.
    expect(stroke.ball.x).toBeGreaterThan(1.5);
    expect(stroke.ball.x).toBeLessThan(4);
  });
});

describe("holing out and lipping out", () => {
  it("a slow ball that reaches the capture radius under CAPTURE_SPEED holes", () => {
    // launchSpeed(0.2) = 1.48 m/s; at 0.5 m it's down to about 0.83 m/s, under CAPTURE_SPEED.
    const hole = testHole({ cup: [0.5, 1], captureRadius: 0.08 });
    const stroke = playStroke(hole, { speed: 0.2 });
    expect(stroke.outcome).toBe("holed");
  });

  it("a fast ball over CAPTURE_SPEED lips out instead of holing", () => {
    // launchSpeed(1) = 5 m/s; at 3 m it's still 4 m/s, well over CAPTURE_SPEED.
    const hole = testHole({ cup: [3, 1], captureRadius: 0.08 });
    const stroke = playStroke(hole, { speed: 1 });
    expect(stroke.outcome).not.toBe("holed");
    expect(stroke.ball.x).toBeGreaterThan(3);
  });

  it("a fast ball can't tunnel through the cup untouched (segment test, not point test)", () => {
    // The cup sits well inside one physics step's travel at full speed (~8 cm), so a point-only
    // test on the ball's end-of-step position alone could miss it. The uncontested full-power roll
    // is 8.33 m (0.6 + 4.4 x speed, ROLL_DECEL 1.5); a lip-out at the 4 m cup loses a quarter of
    // its pace there, so it comes up well short of that.
    const hole = testHole({ cup: [4, 1], captureRadius: 0.07 });
    const stroke = playStroke(hole, { speed: 1 });
    expect(stroke.ball.x).toBeLessThan(7);
  });
});

describe("hazards and out of bounds (rule 8)", () => {
  it("a ball that enters a circular hazard goes off play", () => {
    const hole = testHole({
      cup: [50, 1],
      hazards: [{ kind: "water", shape: { circle: [2, 1], radius: 0.3 } }],
    });
    const stroke = playStroke(hole, { speed: 1 });
    expect(stroke.outcome).toBe("offPlay");
  });

  it("a ball that crosses a box hazard goes off play, even mid-step at speed", () => {
    // A band narrower than one physics step's travel at speed (~7 to 8 cm near full power), so a
    // point-only test on the step's end position alone could jump clean over it.
    const hole = testHole({
      cup: [50, 1],
      hazards: [
        {
          kind: "pit",
          shape: {
            box: [
              [1.98, 0],
              [2.02, 2],
            ],
          },
        },
      ],
    });
    const stroke = playStroke(hole, { speed: 1 });
    expect(stroke.outcome).toBe("offPlay");
  });

  it("a ball whose centre leaves bounds is out of bounds", () => {
    const hole = testHole({
      cup: [50, 1],
      bounds: [
        [-1, -1],
        [3, 3],
      ],
      walls: [], // nothing to bounce off: the ball sails straight out
    });
    const stroke = playStroke(hole, { speed: 1 });
    expect(stroke.outcome).toBe("offPlay");
  });
});

describe("resetSpot (rule 8's operational reset)", () => {
  it("walks back RESET_BACKOFF along the stroke's own path when that point is clear", () => {
    const hole = testHole({
      cup: [50, 1],
      hazards: [
        {
          kind: "water",
          shape: {
            box: [
              [3, 0],
              [3.5, 2],
            ],
          },
        },
      ],
    });
    const stroke = playStroke(hole, { speed: 1 });
    expect(stroke.outcome).toBe("offPlay");
    const spot = resetSpot(stroke.path, hole, hole.tee);
    expect(spot[0]).toBeLessThan(3); // clear of the hazard
    expect(spot[0]).toBeGreaterThan(hole.tee[0]); // and back on the path, not at the tee
  });

  it("falls back to the stroke's start when no point on the path clears play", () => {
    // A hazard that swallows almost the whole path: RESET_BACKOFF (0.2 m) back from where it left
    // play still lands inside (or right against) the hazard.
    const hole = testHole({
      cup: [50, 1],
      hazards: [
        {
          kind: "water",
          shape: {
            box: [
              [0.05, 0],
              [3, 2],
            ],
          },
        },
      ],
    });
    const stroke = playStroke(hole, { speed: 1, ball: [0, 1] });
    expect(stroke.outcome).toBe("offPlay");
    const spot = resetSpot(stroke.path, hole, [0, 1]);
    expect(spot).toEqual([0, 1]);
  });

  it("falls back all the way to the tee when even the stroke's start doesn't clear play", () => {
    // The stroke starts mid-hole (not from the tee) at a spot the hazard has since swallowed, so
    // neither the path walk-back nor the stroke-start fallback clears play.
    const hole = testHole({
      tee: [-3, 1],
      cup: [50, 1],
      hazards: [
        {
          kind: "water",
          shape: {
            box: [
              [-1, 0],
              [3, 2],
            ],
          },
        },
      ],
    });
    const startedFromInsideHazard = startStroke({
      playerId: "p1",
      hole: 1,
      strokeNumber: 1,
      turn: 1,
      auto: false,
      atMs: 0,
      ball: [0, 1],
      cup: hole.cup,
      yaw: 0,
      speed: 0.5,
      angle: 0,
    });
    const stepped = stepStroke(startedFromInsideHazard, hole);
    const spot = resetSpot(stepped.path, hole, [0, 1]);
    expect(spot).toEqual(hole.tee);
  });
});

describe("constant deceleration (not floorFriction's exponential damping)", () => {
  it("a rolling ball comes to a dead stop, never creeping forever", () => {
    const hole = testHole({ cup: [50, 1] });
    const stroke = playStroke(hole, { speed: 0.5 });
    expect(stroke.ball.vx).toBe(0);
    expect(stroke.ball.vy).toBe(0);
  });

  it("never reverses direction while slowing down", () => {
    const hole = testHole({ cup: [50, 1] });
    let stroke = startStroke({
      playerId: "p1",
      hole: 1,
      strokeNumber: 1,
      turn: 1,
      auto: false,
      atMs: 0,
      ball: hole.tee,
      cup: hole.cup,
      yaw: 0,
      speed: 0.3,
      angle: 0,
    });
    let nowMs = 0;
    let lastX = stroke.ball.x;
    for (let i = 0; i < 60 * 5; i++) {
      nowMs += 1000 / 60;
      stroke = stepStroke(stroke, hole);
      expect(stroke.ball.x).toBeGreaterThanOrEqual(lastX - 1e-9);
      lastX = stroke.ball.x;
    }
  });
});
