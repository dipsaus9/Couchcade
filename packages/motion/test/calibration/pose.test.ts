import { describe, expect, it } from "vitest";
import { calibrateRest, createPoseTracker } from "@couchcade/motion/calibration";
import type { Calibration } from "@couchcade/motion/calibration";
import type { MotionSample, Trace, TraceVector } from "@couchcade/motion/sensors";
import { angleBetween, G, samplesOf } from "./traces.ts";

const RAD = Math.PI / 180;
const vector = ([x, y, z]: Readonly<TraceVector>) => ({ x, y, z });

/** A flat phone, face up, held still for 3 seconds with a gyroscope bias. */
const flat = (rawSigns: Trace["rawSigns"] = "w3c", bias: TraceVector = [0, 0, 0]) =>
  samplesOf({ durationMs: 3000, rawSigns, gravity: () => [0, 0, G], rotation: () => bias });

/**
 * A flat phone, face up, still for 1.1 seconds, then turning at `rate` deg/s around one device axis
 * for one second, then still again. Gravity follows the physics: turning the phone by +θ around a
 * device axis turns the world's up, seen from the phone, by −θ around that axis.
 */
function tiltTrace(axis: "alpha" | "beta" | "gamma", rate: number, rawSigns: Trace["rawSigns"]) {
  const angleAt = (t: number) => Math.min(Math.max(t - 1100, 0), 1000) * (rate / 1000) * RAD;
  const gravity = (t: number): TraceVector => {
    const a = -angleAt(t);
    if (axis === "alpha") return [0, -G * Math.sin(a), G * Math.cos(a)];
    if (axis === "beta") return [G * Math.sin(a), 0, G * Math.cos(a)];
    return [0, 0, G];
  };
  return samplesOf({
    durationMs: 2500,
    rawSigns,
    gravity,
    rotation: (t) => {
      const on = t > 1100 && t <= 2100 ? rate : 0;
      return axis === "alpha" ? [on, 0, 0] : axis === "beta" ? [0, on, 0] : [0, 0, on];
    },
  });
}

const calibrated = (samples: MotionSample[]) => {
  const calibration = calibrateRest(samples);
  if (!calibration) throw new Error("calibration did not complete");
  return calibration;
};

describe("rotation rate signs (motion.md sign rule 4)", () => {
  it.each([
    ["alpha", "w3c", [0, 1, 0]],
    ["alpha", "inverted", [0, 1, 0]],
    ["beta", "w3c", [-1, 0, 0]],
    ["beta", "inverted", [-1, 0, 0]],
  ] as const)(
    "integrating +90 deg/s of %s predicts the gravity change the accelerometer saw (%s)",
    (axis, rawSigns, finalUp) => {
      const samples = tiltTrace(axis, 90, rawSigns);
      const calibration = calibrated(samples);
      // Gyroscope only: no gravity correction, so the prediction is the rotation rate's alone.
      const tracker = createPoseTracker(calibration, { gravityGain: 0 });
      const flipped = createPoseTracker(calibration, { gravityGain: 0 });

      for (const sample of samples.filter((s) => s.t > calibration.t)) {
        tracker.push(sample);
        const rate = sample.rotationRate;
        flipped.push({
          ...sample,
          rotationRate: rate && { alpha: -rate.alpha, beta: -rate.beta, gamma: -rate.gamma },
        });
        const measured = sample.gravityAcceleration;
        if (!measured) throw new Error("no gravity");
        const w3c =
          rawSigns === "inverted" ? { x: -measured.x, y: -measured.y, z: -measured.z } : measured;
        expect(angleBetween(tracker.up(), w3c)).toBeLessThan(2);
      }

      // Tilted a quarter turn: the top edge (alpha) or the left edge (beta) now points up.
      expect(tracker.up()).toBeNearVector(finalUp, 1);
      // Flipping the rate would predict the opposite tilt.
      expect(angleBetween(flipped.up(), vector(finalUp))).toBeGreaterThan(170);
    },
  );
});

describe("createPoseTracker", () => {
  it("starts at the rest pose: gravity is up in the motion frame", () => {
    const samples = flat();
    const tracker = createPoseTracker(calibrated(samples));
    const reading = tracker.push(samples[70] as MotionSample);

    expect(reading.gravityAcceleration).toBeNearVector([0, 0, G], 6);
    expect(reading.acceleration).toBeNearVector([0, 0, 0], 6);
    expect(tracker.toMotion({ x: 0, y: 1, z: 0 })).toBeNearVector([0, 1, 0], 6);
    expect(reading.orientation).toEqual(tracker.orientation());
  });

  it("subtracts the gyroscope bias, so a still phone doesn't drift", () => {
    const samples = flat("w3c", [2, -1.5, 3]);
    const calibration = calibrated(samples);
    const tracker = createPoseTracker(calibration, { gravityGain: 0 });
    for (const sample of samples.filter((s) => s.t > calibration.t)) tracker.push(sample);

    expect(tracker.toMotion({ x: 1, y: 0, z: 0 })).toBeNearVector([1, 0, 0], 6);
    expect(tracker.up()).toBeNearVector([0, 0, 1], 6);
  });

  it("follows a turn around up: the phone's right edge ends up pointing at the TV", () => {
    const samples = tiltTrace("gamma", 90, "inverted");
    const calibration = calibrated(samples);
    const tracker = createPoseTracker(calibration);
    let last = null;
    for (const sample of samples.filter((s) => s.t > calibration.t)) last = tracker.push(sample);

    expect(tracker.toMotion({ x: 1, y: 0, z: 0 })).toBeNearVector([0, 1, 0], 1);
    // A push along the phone's right edge is a push towards the TV.
    const pushed = tracker.push({
      ...(samples.at(-1) as MotionSample),
      t: 2600,
      acceleration: { x: -3, y: 0, z: 0 }, // inverted, as delivered
      rotationRate: { alpha: 0, beta: 0, gamma: 0 },
    });
    expect(pushed.acceleration).toBeNearVector([0, 3, 0], 1);
    expect(last?.gravityAcceleration).toBeNearVector([0, 0, G], 2);
  });

  it("caps each integration step at 50 ms, so a stalled sensor doesn't jump", () => {
    const calibration = calibrated(flat());
    const tracker = createPoseTracker(calibration, { gravityGain: 0 });
    const still = { interval: 16, acceleration: null, gravityAcceleration: null };
    tracker.push({ ...still, t: 0, rotationRate: { alpha: 0, beta: 0, gamma: 90 } });
    const reading = tracker.push({
      ...still,
      t: 1000,
      rotationRate: { alpha: 0, beta: 0, gamma: 90 },
    });

    // 90 deg/s over 50 ms is 4.5° around up, not 90°.
    const right = tracker.toMotion({ x: 1, y: 0, z: 0 });
    expect(Math.atan2(right.y, right.x) / RAD).toBeCloseTo(4.5, 6);
    expect(reading.rotationRate).toBeNearVector([0, 0, 90], 6);
  });

  it("pulls pitch and roll towards measured gravity, only near 1 g", () => {
    const calibration = calibrated(flat());
    const tilted = (magnitude: number) => ({
      interval: 16,
      acceleration: null,
      rotationRate: { alpha: 0, beta: 0, gamma: 0 },
      gravityAcceleration: {
        x: 0,
        y: magnitude * Math.sin(20 * RAD),
        z: magnitude * Math.cos(20 * RAD),
      },
    });
    const run = (magnitude: number, count: number) => {
      const tracker = createPoseTracker(calibration);
      for (let i = 0; i < count; i++) tracker.push({ ...tilted(magnitude), t: i * 16 });
      return angleBetween(tracker.up(), tilted(magnitude).gravityAcceleration);
    };

    // 2% per sample: after one sample 98% of the error is left, after 300 almost none.
    expect(run(G, 1)).toBeCloseTo(19.6, 1);
    expect(run(G, 300)).toBeLessThan(0.1);
    expect(run(G + 1.4, 300)).toBeLessThan(0.1);
    // A swing: over 1.5 m/s² away from 1 g, the gyroscope carries the pose alone.
    expect(run(G + 3, 300)).toBeCloseTo(20, 6);
    expect(run(G - 2, 300)).toBeCloseTo(20, 6);
  });

  it("reset goes back to the rest pose", () => {
    const calibration: Calibration = calibrated(flat());
    const tracker = createPoseTracker(calibration, { gravityGain: 0 });
    const still = { interval: 16, acceleration: null, gravityAcceleration: null };
    tracker.push({ ...still, t: 0, rotationRate: { alpha: 90, beta: 0, gamma: 0 } });
    tracker.push({ ...still, t: 40, rotationRate: { alpha: 90, beta: 0, gamma: 0 } });
    expect(angleBetween(tracker.up(), { x: 0, y: 0, z: 1 })).toBeCloseTo(3.6, 6);

    tracker.reset();
    expect(tracker.up()).toBeNearVector([0, 0, 1], 9);
    tracker.push({ ...still, t: 5000, rotationRate: { alpha: 90, beta: 0, gamma: 0 } });
    expect(tracker.up()).toBeNearVector([0, 0, 1], 9);
  });
});
