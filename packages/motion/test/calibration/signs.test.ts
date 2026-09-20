import { describe, expect, it } from "vitest";
import {
  applySigns,
  calibrateRest,
  createSignTracker,
  detectSigns,
  normaliseSample,
} from "@couchcade/motion/calibration";
import { synthetic, traceSamples } from "@couchcade/motion/sensors";
import type { Trace } from "@couchcade/motion/sensors";
import { G, portrait, samplesOf, type TraceSpec } from "./traces.ts";

type VectorLike = { x: number; y: number; z: number };

/** The components of a vector that may be missing: `NaN` never matches, so a missing one fails. */
const vector = (v: VectorLike | null | undefined): [number, number, number] => [
  v?.x ?? NaN,
  v?.y ?? NaN,
  v?.z ?? NaN,
];

describe("detectSigns", () => {
  it("measures W3C signs when y + z is over 2 and inverted signs when it is under -2", () => {
    expect(detectSigns({ x: 0, y: 1, z: 1.5 })).toEqual({ inverted: false, measured: true });
    expect(detectSigns({ x: 0, y: -1, z: -1.5 })).toEqual({ inverted: true, measured: true });
  });

  it("keeps the previous decision, or W3C signs, when the pose is unclear", () => {
    const side = { x: G, y: 1, z: 1 };
    expect(detectSigns(side)).toEqual({ inverted: false, measured: false });
    expect(detectSigns(side, true)).toEqual({ inverted: true, measured: false });
    expect(detectSigns({ x: -G, y: -1, z: -1 }, false)).toEqual({
      inverted: false,
      measured: false,
    });
  });
});

describe("createSignTracker (CC-5.14): the first clear sample sets it, a later one can correct it", () => {
  it("keeps the default while every sample is unclear, without ever measuring", () => {
    const tracker = createSignTracker();
    const side = { x: G, y: 1, z: 1 };
    expect(tracker.push(side)).toEqual({ inverted: false, measured: false });
    expect(tracker.push(side)).toEqual({ inverted: false, measured: false });
    expect(tracker.current()).toEqual({ inverted: false, measured: false });
  });

  it("sets the decision from the first sample outside the unclear band, no dedicated window needed", () => {
    const tracker = createSignTracker();
    const unclear = { x: G, y: 1, z: 1 };
    const clearInverted = { x: 0, y: -5, z: -5 };

    // Two unclear samples first: still the W3C default, not yet measured.
    expect(tracker.push(unclear).measured).toBe(false);
    expect(tracker.push(unclear).measured).toBe(false);
    // The third sample is the first clear one, and it sets the decision immediately.
    expect(tracker.push(clearInverted)).toEqual({ inverted: true, measured: true });
    expect(tracker.current()).toEqual({ inverted: true, measured: true });
  });

  it("lets a later clear sample correct an earlier one", () => {
    const tracker = createSignTracker();
    expect(tracker.push({ x: 0, y: -5, z: -5 })).toEqual({ inverted: true, measured: true });
    // An unclear sample in between keeps the running decision, not the original default.
    expect(tracker.push({ x: G, y: 1, z: 1 })).toEqual({ inverted: true, measured: false });
    // A later, disagreeing clear sample corrects it.
    expect(tracker.push({ x: 0, y: 5, z: 5 })).toEqual({ inverted: false, measured: true });
    expect(tracker.current()).toEqual({ inverted: false, measured: true });
  });

  it("starts an unclear pose from the previous page-session decision, exactly like detectSigns", () => {
    const unclear = { x: G, y: 0.5, z: 0.5 };
    expect(createSignTracker(true).push(unclear)).toEqual({ inverted: true, measured: false });
    expect(createSignTracker(false).push(unclear)).toEqual({ inverted: false, measured: false });
    expect(createSignTracker().push(unclear)).toEqual({ inverted: false, measured: false });
  });

  it("reset() starts over at the original previous decision, not whatever it last corrected to", () => {
    const tracker = createSignTracker(false);
    tracker.push({ x: 0, y: -5, z: -5 }); // corrects to inverted: true
    expect(tracker.current().inverted).toBe(true);
    tracker.reset();
    expect(tracker.current()).toEqual({ inverted: false, measured: false });
  });
});

describe("applySigns", () => {
  const sample = {
    t: 5,
    interval: 16,
    acceleration: { x: 1, y: -2, z: 3 },
    gravityAcceleration: { x: -4, y: 5, z: -6 },
    rotationRate: { alpha: 7, beta: -8, gamma: 9 },
  };

  it("negates both acceleration fields and never the rotation rate", () => {
    const flipped = applySigns(sample, true);
    expect(flipped.acceleration).toBeNearVector([-1, 2, -3]);
    expect(flipped.gravityAcceleration).toBeNearVector([4, -5, 6]);
    expect(flipped.rotationRate).toEqual(sample.rotationRate);
  });

  it("leaves W3C samples as they are", () => {
    expect(applySigns(sample, false)).toBe(sample);
  });
});

describe("calibration detects the gravity sign instead of assuming the platform", () => {
  it.each([0, 20, 45, 70, 90])(
    "a portrait phone at %i° reads the same in both conventions",
    (tilt) => {
      const gravity = portrait(tilt);
      const w3c = calibrateRest(traceSamples(synthetic.still({ gravity, rawSigns: "w3c" })));
      const inverted = calibrateRest(
        traceSamples(synthetic.still({ gravity, rawSigns: "inverted" })),
      );

      expect(w3c).toMatchObject({ inverted: false, signMeasured: true });
      expect(inverted).toMatchObject({ inverted: true, signMeasured: true });
      expect(inverted?.up).toBeNearVector(vector(w3c?.up), 6);
      for (const axis of ["right", "forward", "up"] as const) {
        expect(inverted?.frame[axis]).toBeNearVector(vector(w3c?.frame[axis]), 6);
      }
    },
  );

  it("keeps the earlier decision from this page session when the phone is on its side", () => {
    const side: [number, number, number] = [G, 0.5, 0.5];
    const still = (rawSigns: Trace["rawSigns"]) =>
      traceSamples(synthetic.still({ gravity: side, rawSigns }));

    expect(calibrateRest(still("inverted"))).toMatchObject({
      inverted: false,
      signMeasured: false,
    });
    expect(calibrateRest(still("inverted"), { previousInverted: true })).toMatchObject({
      inverted: true,
      signMeasured: false,
    });
  });
});

describe("normalised readings are the same for iOS and Android sign conventions", () => {
  // One second still at 35°, then a push towards the TV with a wrist turn: linear acceleration
  // along the phone's forward direction and a rotation rate on every axis.
  const tilt = 35;
  const angle = (tilt * Math.PI) / 180;
  const forward: [number, number, number] = [0, Math.cos(angle), -Math.sin(angle)];
  const spec = (rawSigns: Trace["rawSigns"]): TraceSpec => ({
    durationMs: 2000,
    rawSigns,
    gravity: () => portrait(tilt),
    acceleration: (t) => {
      const push = t > 1200 && t < 1500 ? 4 : 0;
      return [push * forward[0], push * forward[1], push * forward[2]];
    },
    rotation: (t) => (t > 1200 && t < 1500 ? [30, -40, 50] : [0.6, -0.4, 0.2]),
  });

  const android = samplesOf(spec("w3c"));
  const ios = samplesOf(spec("inverted"));
  const androidCalibration = calibrateRest(android);
  const iosCalibration = calibrateRest(ios);

  it("detects each convention", () => {
    expect(androidCalibration?.inverted).toBe(false);
    expect(iosCalibration?.inverted).toBe(true);
  });

  it("gives identical motion-frame values sample by sample", () => {
    if (!androidCalibration || !iosCalibration) throw new Error("calibration did not complete");
    android.forEach((sample, index) => {
      const a = normaliseSample(sample, androidCalibration);
      const b = normaliseSample(ios[index] ?? sample, iosCalibration);
      expect(b.acceleration).toBeNearVector(vector(a.acceleration), 6);
      expect(b.gravityAcceleration).toBeNearVector(vector(a.gravityAcceleration), 6);
      expect(b.rotationRate).toBeNearVector(vector(a.rotationRate), 6);
    });
  });

  it("puts gravity on up and the push on forward in both", () => {
    for (const [samples, calibration] of [
      [android, androidCalibration],
      [ios, iosCalibration],
    ] as const) {
      if (!calibration) throw new Error("calibration did not complete");
      const pushing = samples.find((sample) => sample.t > 1300) ?? samples[0];
      if (!pushing) throw new Error("no samples");
      const normalised = normaliseSample(pushing, calibration);
      expect(normalised.acceleration).toBeNearVector([0, 4, 0], 2);
      expect(normalised.gravityAcceleration).toBeNearVector([0, 4, G], 2);
      expect(normaliseSample(samples[0] ?? pushing, calibration).rotationRate).toBeNearVector(
        [0, 0, 0],
        2,
      );
    }
  });
});
