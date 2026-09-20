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
    expect(rest.progress().calibrated).toBe(true);
  });

  it("keeps running after the first still stretch, and starts fully over on reset", () => {
    const rest = createRestCalibration();
    const samples = traceSamples(synthetic.still({ durationMs: 1500 }));
    const first = samples.map((sample) => rest.push(sample)).find(Boolean);
    expect(first).not.toBeNull();

    // A still phone keeps refining the same reading: still calibrated, still no bias.
    const again = rest.push(samples.at(-1) as MotionSample);
    expect(again).toMatchObject({ inverted: false, bias: { alpha: 0, beta: 0, gamma: 0 } });
    expect(rest.progress().calibrated).toBe(true);

    rest.reset();
    expect(rest.progress()).toEqual({ elapsedMs: 0, stillMs: 0, restarts: 0, calibrated: false });
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

  it("reports progress for the hold-still screen, including whether a still stretch has landed", () => {
    const rest = createRestCalibration();
    for (const sample of traceSamples(synthetic.still({ durationMs: 500 }))) rest.push(sample);
    expect(rest.progress()).toEqual({
      elapsedMs: 500,
      stillMs: 500,
      restarts: 0,
      calibrated: false,
    });
  });

  it("skips samples without gravity-including acceleration", () => {
    const rest = createRestCalibration();
    const empty = { t: 0, interval: 16, acceleration: null, gravityAcceleration: null };
    expect(rest.push({ ...empty, rotationRate: null })).toBeNull();
    expect(rest.progress().elapsedMs).toBe(0);
  });
});

describe("rest calibration: continuous re-estimation over a session (CC-5.14)", () => {
  it("re-measures the bias on every fresh still stretch, never locking the first one", () => {
    // A simulated session: still with one bias for 1.2 s, a turn, then still again with a
    // different bias for another 1.2 s -- the phone changed hands between two "shots".
    const firstStretch = samplesOf({
      durationMs: 1200,
      gravity: () => portrait(20),
      rotation: () => [2, 1, 0],
    });
    const turn = samplesOf({
      durationMs: 300,
      intervalMs: 1000 / 60,
      gravity: (t) => portrait(20 + (t / 300) * 40),
      rotation: () => [40, 0, 0],
    }).map((sample) => ({ ...sample, t: sample.t + 1200 }));
    const secondStretch = samplesOf({
      durationMs: 1200,
      gravity: () => portrait(60),
      rotation: () => [-3, 2, 1],
    }).map((sample) => ({ ...sample, t: sample.t + 1500 }));

    const rest = createRestCalibration();
    const results: Array<ReturnType<typeof rest.push>> = [];
    for (const sample of [...firstStretch, ...turn, ...secondStretch]) {
      results.push(rest.push(sample));
    }

    // The first still stretch measures [2, 1, 0] well before the turn.
    const afterFirstStretch = results.find((result) => result !== null);
    expect(afterFirstStretch?.bias).toEqual({ alpha: 2, beta: 1, gamma: 0 });
    expect(afterFirstStretch?.t).toBeLessThan(1200);

    // restarting the still stretch across the turn is visible on progress().
    expect(rest.progress().restarts).toBeGreaterThanOrEqual(1);

    // The final result, after the second still stretch completed, reflects the *new* bias --
    // the estimator kept watching and updated instead of freezing on the first measurement.
    const final = results.at(-1);
    expect(final?.bias.alpha).toBeCloseTo(-3, 5);
    expect(final?.bias.beta).toBeCloseTo(2, 5);
    expect(final?.bias.gamma).toBeCloseTo(1, 5);
    expect(final?.timedOut).toBe(false);
    expect(rest.progress().calibrated).toBe(true);
  });

  it("skips samples without gravity but keeps the last known estimate", () => {
    const rest = createRestCalibration();
    for (const sample of traceSamples(synthetic.still({ durationMs: 1000 }))) rest.push(sample);
    const calibrated = rest.progress().calibrated;
    expect(calibrated).toBe(true);

    const empty: MotionSample = {
      t: 5000,
      interval: 16,
      acceleration: null,
      gravityAcceleration: null,
      rotationRate: null,
    };
    expect(rest.push(empty)).toMatchObject({ bias: { alpha: 0, beta: 0, gamma: 0 } });
  });

  it("corrects the gravity sign used by later still-stretch measurements, end to end", () => {
    // On its side, held still: unclear pose, so the sign stays the W3C default (not yet measured).
    const onSide = samplesOf({
      durationMs: 1200,
      gravity: () => [G, 0, 0],
      rotation: () => [1, 0, 0],
    });
    // The phone is turned face down: a clear, inverted pose. The magnitude jump also breaks the
    // still stretch, same as any real reorientation would.
    const flippedTurn = samplesOf({
      durationMs: 300,
      gravity: (t) => [G * (1 - t / 300), 0, -G * (t / 300)],
      rotation: () => [40, 0, 0],
    }).map((sample) => ({ ...sample, t: sample.t + 1200 }));
    const faceDown = samplesOf({
      durationMs: 1200,
      gravity: () => [0, 0, -G],
      rotation: () => [0.5, 0, 0],
    }).map((sample) => ({ ...sample, t: sample.t + 1500 }));

    const rest = createRestCalibration();
    const results = [...onSide, ...flippedTurn, ...faceDown].map((sample) => rest.push(sample));

    const firstMeasured = results.find((result) => result?.signMeasured);
    expect(firstMeasured?.inverted).toBe(true);
    const final = results.at(-1);
    expect(final?.inverted).toBe(true);
    expect(final?.signMeasured).toBe(true);
    expect(final?.bias).toEqual({ alpha: 0.5, beta: 0, gamma: 0 });
  });
});

describe("rest calibration: never a zero or unmeasured bias (CC-5.14)", () => {
  it("returns null before any estimate exists -- not a zero-bias placeholder", () => {
    const rest = createRestCalibration();
    const samples = traceSamples(synthetic.still({ durationMs: 1000 }));
    // Just the first sample: neither a still stretch nor the timeout have happened yet.
    expect(rest.push(samples[0] as MotionSample)).toBeNull();
  });

  it("never falls back to a zero bias on timeout: uses the best noisy estimate instead", () => {
    // A shaky hand: rotation over 10 deg/s every other sample, drifting from flat to upright, so
    // no still stretch of 1,000 ms ever completes.
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
    expect(rest.progress().calibrated).toBe(false);
    // Never zero: the bias is the real (noisy) mean of the most recent 250 ms of rotation rate,
    // not a placeholder. Samples after 4,750 ms: 4,760 to 5,000.
    const window = samples.filter((sample) => sample.t > 4750 && sample.t <= 5000);
    expect(window).toHaveLength(13);
    const meanAlpha =
      window.reduce((sum, sample) => sum + (sample.rotationRate?.alpha ?? 0), 0) / window.length;
    expect(calibration?.bias).not.toEqual({ alpha: 0, beta: 0, gamma: 0 });
    expect(calibration?.bias.alpha).toBeCloseTo(meanAlpha, 5);
    expect(calibration?.bias.beta).toBeCloseTo(3, 5);
    expect(calibration?.bias.gamma).toBeCloseTo(0, 5);
    // The gravity direction it used is still the real recent average, not a placeholder either.
    const meanGravity = window.reduce(
      (sum, sample) => {
        const g = sample.gravityAcceleration ?? { x: 0, y: 0, z: 0 };
        return { x: sum.x + g.x, y: sum.y + g.y, z: sum.z + g.z };
      },
      { x: 0, y: 0, z: 0 },
    );
    expect(angleBetween(calibration?.up ?? meanGravity, meanGravity)).toBeLessThan(0.01);
  });

  it("replaces the noisy fallback with a real measurement as soon as a still stretch lands", () => {
    // Shaky for the first 5.46 s (never still long enough, and turning on the very last sample so
    // the still stretch below starts clean), then the hand settles at 5.5 s for 1.2 s with a
    // clean, known bias.
    const shaky = samplesOf({
      durationMs: 5460,
      intervalMs: 20,
      gravity: () => portrait(20),
      rotation: (t) => [Math.round(t / 20) % 2 ? 25 : 0, 0, 0],
    });
    const settled = samplesOf({
      durationMs: 1200,
      gravity: () => portrait(20),
      rotation: () => [4, -1, 2],
    }).map((sample) => ({ ...sample, t: sample.t + 5500 }));

    const rest = createRestCalibration();
    let sawTimeoutFallback = false;
    let final: ReturnType<typeof rest.push> = null;
    for (const sample of [...shaky, ...settled]) {
      const calibration = rest.push(sample);
      if (calibration?.timedOut) sawTimeoutFallback = true;
      if (calibration) final = calibration;
    }

    expect(sawTimeoutFallback).toBe(true);
    expect(rest.progress().calibrated).toBe(true);
    expect(final?.timedOut).toBe(false);
    expect(final?.bias).toEqual({ alpha: 4, beta: -1, gamma: 2 });
  });

  it("accelerometer-only phones legitimately have no bias to measure: zero is correct there, not a fallback", () => {
    const samples = traceSamples(synthetic.still({ gyroscope: false }));
    const calibration = calibrateRest(samples);
    expect(calibration).toMatchObject({ t: 1000, timedOut: false });
    expect(calibration?.bias).toEqual({ alpha: 0, beta: 0, gamma: 0 });
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
