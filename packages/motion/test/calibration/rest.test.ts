import { describe, expect, it } from "vitest";
import { calibrateRest, createRestCalibration } from "@couchcade/motion/calibration";
import { synthetic, traceSamples } from "@couchcade/motion/sensors";
import type { MotionSample } from "@couchcade/motion/sensors";
import { angleBetween, G, noise, portrait, samplesOf } from "./traces.ts";

const S = Math.SQRT1_2;

// Still flat for 500 ms, tilted towards upright between 500 and 800 ms, then still at 45°. The
// gyroscope reads a bias of 2, -1 and 0.5 deg/s throughout.
const tiltAt = (t: number) => Math.min(Math.max((t - 500) / 300, 0), 1) * 45;
const moving = () =>
  samplesOf({
    durationMs: 4000,
    gravity: (t) => portrait(tiltAt(t)),
    rotation: (t) => [t > 500 && t < 800 ? 150 + 2 : 2, -1, 0.5],
  });

describe("rest calibration: holding still for 1 second", () => {
  it("captures the gravity vector once the phone has been still for 1,000 ms, not before", () => {
    const rest = createRestCalibration();
    const samples = traceSamples(synthetic.still({ durationMs: 1000 }));
    const results = samples.map((sample) => rest.push(sample));

    expect(results.slice(0, -1).every((result) => result === null)).toBe(true);
    const calibration = results.at(-1);
    expect(calibration).toMatchObject({ t: 1000, timedOut: false, inverted: false });
    expect(calibration?.up).toBeNearVector([0, S, S]);
    expect(calibration?.bias).toEqual({ alpha: 0, beta: 0, gamma: 0 });
    expect(calibration?.interval).toBeCloseTo(16.667, 3);
  });

  it("keeps returning the same calibration for later samples, and starts over on reset", () => {
    const rest = createRestCalibration();
    const samples = traceSamples(synthetic.still({ durationMs: 1500 }));
    const first = samples.map((sample) => rest.push(sample)).find(Boolean);

    expect(rest.push(samples.at(-1) as MotionSample)).toBe(first);
    rest.reset();
    expect(rest.progress()).toEqual({ elapsedMs: 0, stillMs: 0, restarts: 0 });
    expect(rest.push(samples[0] as MotionSample)).toBeNull();
  });

  it("measures the gyroscope bias and ignores noise on a noisy still phone", () => {
    const random = noise(42);
    const bias: [number, number, number] = [1.5, -2, 0.8];
    const samples = samplesOf({
      durationMs: 3000,
      gravity: () => {
        const [x, y, z] = portrait(40);
        return [x + random(0.15), y + random(0.15), z + random(0.15)];
      },
      rotation: () => [bias[0] + random(3), bias[1] + random(3), bias[2] + random(3)],
    });
    const calibration = calibrateRest(samples);

    expect(calibration?.timedOut).toBe(false);
    expect(calibration?.t).toBeCloseTo(1000, 0);
    expect(calibration?.bias.alpha).toBeCloseTo(bias[0], 0);
    expect(calibration?.bias.beta).toBeCloseTo(bias[1], 0);
    expect(calibration?.bias.gamma).toBeCloseTo(bias[2], 0);
    const [x, y, z] = portrait(40);
    expect(angleBetween(calibration?.up ?? { x: 0, y: 0, z: 0 }, { x, y, z })).toBeLessThan(1);
  });

  it("reports progress for the hold-still screen", () => {
    const rest = createRestCalibration();
    for (const sample of traceSamples(synthetic.still({ durationMs: 500 }))) rest.push(sample);
    expect(rest.progress()).toEqual({ elapsedMs: 500, stillMs: 500, restarts: 0 });
  });

  it("skips samples without gravity-including acceleration", () => {
    const rest = createRestCalibration();
    const empty = { t: 0, interval: 16, acceleration: null, gravityAcceleration: null };
    expect(rest.push({ ...empty, rotationRate: null })).toBeNull();
    expect(rest.progress().elapsedMs).toBe(0);
  });
});

describe("rest calibration: a phone that moves", () => {
  it("starts the still second over when the phone turns, and keeps turning out of the bias", () => {
    const rest = createRestCalibration();
    let calibration = null;
    for (const sample of moving()) {
      calibration = rest.push(sample);
      if (calibration) break;
    }

    expect(rest.progress().restarts).toBe(1);
    expect(calibration?.timedOut).toBe(false);
    // The first still sample after the turn is at 800 ms, so the still second ends at 1,800 ms.
    expect(calibration?.t).toBeCloseTo(1800, -1);
    expect(calibration?.up).toBeNearVector([0, S, S]);
    expect(calibration?.bias.alpha).toBeCloseTo(2, 3);
    expect(calibration?.bias.beta).toBeCloseTo(-1, 3);
    expect(calibration?.bias.gamma).toBeCloseTo(0.5, 3);
  });

  it("starts over on an accelerometer-only phone when the gravity-including magnitude jumps", () => {
    const samples = samplesOf({
      durationMs: 3000,
      gravity: () => portrait(30),
      acceleration: (t) => (t > 600 && t < 700 ? [0, 3, 0] : [0, 0, 0]),
      rotation: null,
    });
    const rest = createRestCalibration();
    const calibration = samples.map((sample) => rest.push(sample)).find(Boolean);

    expect(rest.progress().restarts).toBeGreaterThanOrEqual(1);
    expect(calibration?.t).toBeGreaterThanOrEqual(1700);
    expect(calibration?.bias).toEqual({ alpha: 0, beta: 0, gamma: 0 });
    expect(calibration?.up).toBeNearVector([0, 0.5, Math.sqrt(3) / 2]);
  });

  it("calibrates an accelerometer-only phone held still with a zero bias", () => {
    const samples = traceSamples(synthetic.still({ gyroscope: false }));
    const calibration = calibrateRest(samples);
    expect(calibration).toMatchObject({ t: 1000, timedOut: false });
    expect(calibration?.bias).toEqual({ alpha: 0, beta: 0, gamma: 0 });
  });

  it("gives up after 5 seconds without a still second: the latest 250 ms average and zero bias", () => {
    // A shaky hand: rotation over 10 deg/s every other sample, drifting from flat to upright.
    const samples = samplesOf({
      durationMs: 8000,
      intervalMs: 20,
      gravity: (t) => portrait(Math.min(t / 5000, 1) * 90),
      rotation: (t) => [Math.round(t / 20) % 2 ? 25 : 0, 3, 0],
    });
    const rest = createRestCalibration();
    const results = samples.map((sample) => rest.push(sample));
    const index = results.findIndex(Boolean);
    const calibration = results[index];

    expect(samples[index]?.t).toBe(5000);
    expect(calibration).toMatchObject({ timedOut: true, t: 5000, interval: 20 });
    expect(calibration?.bias).toEqual({ alpha: 0, beta: 0, gamma: 0 });
    // Samples after 4,750 ms: 4,760 to 5,000, gravity tilted about 87.5° on average.
    const window = samples.filter((sample) => sample.t > 4750 && sample.t <= 5000);
    const mean = window.reduce(
      (sum, sample) => {
        const g = sample.gravityAcceleration ?? { x: 0, y: 0, z: 0 };
        return { x: sum.x + g.x, y: sum.y + g.y, z: sum.z + g.z };
      },
      { x: 0, y: 0, z: 0 },
    );
    expect(window).toHaveLength(13);
    expect(angleBetween(calibration?.up ?? mean, mean)).toBeLessThan(0.01);
  });

  it("uses custom still and timeout durations", () => {
    const samples = traceSamples(synthetic.still({ durationMs: 1000 }));
    expect(calibrateRest(samples, { stillMs: 500 })?.t).toBeCloseTo(500, 0);
    const turning = samplesOf({
      durationMs: 2000,
      gravity: () => [0, 0, G],
      rotation: () => [20, 0, 0],
    });
    expect(calibrateRest(turning, { timeoutMs: 1500 })).toMatchObject({ timedOut: true });
    expect(calibrateRest(turning)).toBeNull();
  });
});
