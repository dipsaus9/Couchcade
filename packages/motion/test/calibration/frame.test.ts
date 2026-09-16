import { describe, expect, it } from "vitest";
import {
  calibrateRest,
  correctSample,
  motionFrame,
  normaliseSample,
  toFrame,
} from "@couchcade/motion/calibration";
import type { Calibration, MotionFrame } from "@couchcade/motion/calibration";
import { synthetic, traceSamples } from "@couchcade/motion/sensors";
import type { Vec3 } from "@couchcade/motion/sensors";
import { G, portrait } from "./traces.ts";

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (x: number, y: number, z: number): Vec3 => {
  const size = Math.hypot(x, y, z);
  return { x: x / size, y: y / size, z: z / size };
};

/** How far `frame` is from orthonormal and right-handed (`right = forward × up`): 0 when it is. */
function frameError({ right, forward, up }: MotionFrame): number {
  const handed = cross(forward, up);
  return Math.max(
    ...[right, forward, up].map((v) => Math.abs(dot(v, v) - 1)),
    Math.abs(dot(right, forward)),
    Math.abs(dot(right, up)),
    Math.abs(dot(forward, up)),
    Math.abs(right.x - handed.x),
    Math.abs(right.y - handed.y),
    Math.abs(right.z - handed.z),
  );
}

describe("motionFrame: a portrait phone between flat and upright", () => {
  it.each([0, 15, 45, 60, 89, 90])(
    "at %i°: right is +x, forward is away from the player",
    (tilt) => {
      const angle = (tilt * Math.PI) / 180;
      const frame = motionFrame(unit(0, Math.sin(angle), Math.cos(angle)));

      expect(frameError(frame)).toBeLessThan(1e-9);
      expect(frame.right).toBeNearVector([1, 0, 0], 9);
      // Flat: the top edge (+y) faces the TV. Upright: the back (-z) does.
      expect(frame.forward).toBeNearVector([0, Math.cos(angle), -Math.sin(angle)], 9);
    },
  );

  it("stays orthonormal and right-handed for any up", () => {
    const ups = [
      unit(1, 0, 0),
      unit(-1, 0, 0),
      unit(0, 0, -1),
      unit(0, -1, 0),
      unit(0.3, 0.4, 0.85),
      unit(-0.7, 0.1, -0.2),
      unit(2, -3, 1),
    ];
    for (const up of ups) expect(frameError(motionFrame(up))).toBeLessThan(1e-9);
  });

  it("falls back to +x turned a quarter turn when y − z is almost vertical", () => {
    // Up along y − z: the horizontal part of y − z has length 0.
    const frame = motionFrame(unit(0, 1, -1));
    expect(frameError(frame)).toBeLessThan(1e-9);
    expect(frame.right).toBeNearVector([1, 0, 0], 9);
    expect(frame.forward).toBeNearVector([0, -Math.SQRT1_2, -Math.SQRT1_2], 9);

    // 15° away the horizontal part is 0.26, so the main rule applies, and it agrees in direction.
    const nearby = motionFrame(unit(0, Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)));
    expect(frameError(nearby)).toBeLessThan(1e-9);
    expect(nearby.right).toBeNearVector([1, 0, 0], 9);
    expect(dot(nearby.forward, frame.forward)).toBeGreaterThan(0.9);
  });
});

describe("normalising a portrait phone to the motion frame", () => {
  it.each([0, 30, 60, 90])(
    "at %i°: gravity is z, a push to the right is x, turning around up is z",
    (tilt) => {
      for (const rawSigns of ["w3c", "inverted"] as const) {
        const samples = traceSamples(synthetic.still({ gravity: portrait(tilt), rawSigns }));
        const calibration = calibrateRest(samples) as Calibration;
        const angle = (tilt * Math.PI) / 180;
        const sign = rawSigns === "inverted" ? -1 : 1;
        const sample = {
          t: 1100,
          interval: 16.7,
          // Linear acceleration to the player's right, as delivered.
          acceleration: { x: 2 * sign, y: 0, z: 0 },
          gravityAcceleration: {
            x: 2 * sign,
            y: portrait(tilt)[1] * sign,
            z: portrait(tilt)[2] * sign,
          },
          // Turning around world up: gamma when flat, beta when upright.
          rotationRate: { alpha: 0, beta: 90 * Math.sin(angle), gamma: 90 * Math.cos(angle) },
        };
        const normalised = normaliseSample(sample, calibration);

        expect(normalised.acceleration).toBeNearVector([2, 0, 0], 2);
        expect(normalised.gravityAcceleration).toBeNearVector([2, 0, G], 2);
        expect(normalised.rotationRate).toBeNearVector([0, 0, 90], 2);
        expect(normalised).toMatchObject({ t: 1100, interval: 16.7 });
      }
    },
  );

  it("toFrame projects a device vector onto right, forward and up", () => {
    const frame = motionFrame(unit(0, 0, 1));
    expect(toFrame({ x: 1, y: 2, z: 3 }, frame)).toBeNearVector([1, 2, 3], 9);
  });

  it("correctSample fixes signs and removes the gyroscope bias in the device frame", () => {
    const calibration = {
      ...(calibrateRest(traceSamples(synthetic.still({ rawSigns: "inverted" }))) as Calibration),
      bias: { alpha: 1, beta: 2, gamma: 3 },
    };
    const corrected = correctSample(
      {
        t: 0,
        interval: 16,
        acceleration: { x: 1, y: 1, z: 1 },
        gravityAcceleration: null,
        rotationRate: { alpha: 11, beta: 12, gamma: 13 },
      },
      calibration,
    );
    expect(corrected.acceleration).toBeNearVector([-1, -1, -1], 9);
    expect(corrected.gravityAcceleration).toBeNull();
    expect(corrected.rotationRate).toEqual({ alpha: 10, beta: 10, gamma: 10 });
  });
});
