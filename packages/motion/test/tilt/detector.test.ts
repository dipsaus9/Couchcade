import { describe, expect, it } from "vitest";
import {
  TILT_DEAD_ZONE,
  TILT_FULL_DEG,
  TILT_HOLD_ACCELERATION,
  TILT_HOLD_MS,
  type TiltReading,
  createTiltDetector,
} from "@couchcade/motion/gestures";
import type { Trace } from "@couchcade/motion/sensors";
import { CALIBRATION_MS, calibrated, ease, poseReadings, tiltSamples } from "./traces.ts";
import { createPoseTracker } from "@couchcade/motion/calibration";

/** Pushes every reading and returns what the detector emitted. */
function run(
  readings: ReturnType<typeof poseReadings>,
  detector = createTiltDetector(),
): TiltReading[] {
  const emitted: TiltReading[] = [];
  detector.on((reading) => emitted.push(reading));
  for (const reading of readings) detector.push(reading);
  return emitted;
}

/** Turning moves in the second after calibration, then holding still for half a second. */
const MOVE_START = CALIBRATION_MS + 100;
const MOVE_END = CALIBRATION_MS + 1100;
const DURATION = CALIBRATION_MS + 1600;

describe("createTiltDetector", () => {
  it("reads a still, flat phone as rest and emits nothing", () => {
    const detector = createTiltDetector();
    const emitted = run(poseReadings(tiltSamples({ durationMs: DURATION })), detector);
    expect(emitted).toEqual([]);
    expect(detector.tilt()).toEqual({ x: 0, y: 0 });
  });

  it.each([
    ["right", 20],
    ["left", -20],
  ])("rolling %s dips the right edge and gives a signed x", (_, degrees) => {
    const detector = createTiltDetector();
    const roll = ease(0, degrees, MOVE_START, MOVE_END);
    run(poseReadings(tiltSamples({ durationMs: DURATION, roll })), detector);
    const raw = degrees / TILT_FULL_DEG;
    const expectedLength = (Math.abs(raw) - TILT_DEAD_ZONE) / (1 - TILT_DEAD_ZONE);
    expect(detector.tilt().x).toBeCloseTo(Math.sign(degrees) * expectedLength, 1);
    expect(Math.abs(detector.tilt().y)).toBeLessThanOrEqual(0.05);
  });

  it.each([
    ["away", 15],
    ["towards", -15],
  ])("pitching the top edge %s gives a signed y", (_, degrees) => {
    const detector = createTiltDetector();
    const pitch = ease(0, degrees, MOVE_START, MOVE_END);
    run(poseReadings(tiltSamples({ durationMs: DURATION, pitch })), detector);
    const raw = degrees / TILT_FULL_DEG;
    const expectedLength = (Math.abs(raw) - TILT_DEAD_ZONE) / (1 - TILT_DEAD_ZONE);
    expect(detector.tilt().y).toBeCloseTo(Math.sign(degrees) * expectedLength, 1);
    expect(Math.abs(detector.tilt().x)).toBeLessThanOrEqual(0.05);
  });

  it("stays at zero inside the 0.15 dead zone and moves once past it", () => {
    const detector = createTiltDetector();
    // 3° is well inside the dead zone (3 / 25 = 0.12 < 0.15); 6° is just outside it.
    const inside = ease(0, 3, MOVE_START, MOVE_END);
    const emittedInside = run(poseReadings(tiltSamples({ durationMs: DURATION, roll: inside })));
    expect(emittedInside).toEqual([]);
    expect(detector.tilt()).toEqual({ x: 0, y: 0 });

    const outside = ease(0, 6, MOVE_START, MOVE_END);
    const outsideDetector = createTiltDetector();
    const emittedOutside = run(
      poseReadings(tiltSamples({ durationMs: DURATION, roll: outside })),
      outsideDetector,
    );
    expect(emittedOutside.length).toBeGreaterThan(0);
    expect(outsideDetector.tilt().x).toBeGreaterThan(0);
  });

  it("25° of tilt is full scale, clamped to 1 beyond it", () => {
    expect(TILT_FULL_DEG).toBe(25);
    const detector = createTiltDetector();
    const roll = ease(0, 60, MOVE_START, MOVE_END);
    const emitted = run(poseReadings(tiltSamples({ durationMs: DURATION, roll })), detector);
    expect(detector.tilt().x).toBe(1);
    for (const { x, y } of emitted) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Math.abs(y)).toBeLessThanOrEqual(1);
    }
  });

  it("emits values rounded to 0.05, only when they change", () => {
    const roll = ease(0, 20, MOVE_START, MOVE_END);
    const pitch = ease(0, 15, MOVE_START, MOVE_END);
    const emitted = run(poseReadings(tiltSamples({ durationMs: DURATION, roll, pitch })));
    expect(emitted.length).toBeGreaterThan(3);
    for (const reading of emitted) {
      expect(Object.keys(reading).toSorted()).toEqual(["t", "x", "y"]);
      expect(Math.round(reading.x / 0.05) * 0.05).toBeCloseTo(reading.x, 10);
      expect(Math.round(reading.y / 0.05) * 0.05).toBeCloseTo(reading.y, 10);
    }
    const steps = emitted.slice(1).map((reading, index) => {
      const previous = emitted[index] ?? reading;
      return {
        changed: reading.x !== previous.x || reading.y !== previous.y,
        later: reading.t > previous.t,
      };
    });
    expect(steps.every((step) => step.changed && step.later)).toBe(true);
  });

  it("holds the last value for 200ms while linear acceleration is over 12 m/s²", () => {
    const roll = ease(0, 20, MOVE_START, MOVE_END);
    // A bump right when the roll would otherwise still be changing.
    const bumpAt = MOVE_START + 300;
    const acceleration = (t: number): [number, number, number] =>
      t >= bumpAt && t < bumpAt + 50 ? [0, 0, TILT_HOLD_ACCELERATION + 5] : [0, 0, 0];
    const trace = tiltSamples({ durationMs: DURATION, roll, acceleration });
    const readings = poseReadings(trace);

    const detector = createTiltDetector();
    const emitted: TiltReading[] = [];
    detector.on((reading) => emitted.push(reading));

    const beforeBump = readings.filter((r) => r.t < bumpAt);
    for (const reading of beforeBump) detector.push(reading);
    const valueAtBump = detector.tilt();

    // Comfortably inside the hold window (the burst ends by bumpAt + 50, the hold runs 200ms past
    // whichever sample last exceeded the threshold): stop well short of the release boundary.
    const holdEndsBy = bumpAt + 50 + TILT_HOLD_MS;
    const duringHold = readings.filter((r) => r.t >= bumpAt && r.t < holdEndsBy - 40);
    for (const reading of duringHold) detector.push(reading);
    // Nothing changed while held, even though the roll kept moving underneath.
    expect(detector.tilt()).toEqual(valueAtBump);

    const after = readings.filter((r) => r.t >= holdEndsBy + 40);
    for (const reading of after) detector.push(reading);
    // Once the hold lifts, tilt catches up to the phone's actual pose again.
    expect(detector.tilt().x).toBeGreaterThan(valueAtBump.x);
  });

  it("resets to rest and forgets the rest pose", () => {
    const detector = createTiltDetector();
    const roll = ease(0, 20, MOVE_START, MOVE_END);
    run(poseReadings(tiltSamples({ durationMs: DURATION, roll })), detector);
    expect(detector.tilt().x).toBeGreaterThan(0);

    detector.reset();
    expect(detector.tilt()).toEqual({ x: 0, y: 0 });

    // The next reading becomes the new rest pose, however the phone is tilted.
    const trace = calibrated(tiltSamples({ durationMs: DURATION, roll }));
    const tracker = createPoseTracker(trace.calibration);
    const last = trace.samples.at(-1);
    if (!last) throw new Error("no samples");
    detector.push(tracker.push(last));
    expect(detector.tilt()).toEqual({ x: 0, y: 0 });
  });

  it("takes a game range", () => {
    const detector = createTiltDetector({ fullScaleDeg: 50 });
    const roll = ease(0, 25, MOVE_START, MOVE_END);
    run(poseReadings(tiltSamples({ durationMs: DURATION, roll })), detector);
    // 25° over a 50° range is half scale, rescaled past the dead zone.
    const expectedLength = (0.5 - TILT_DEAD_ZONE) / (1 - TILT_DEAD_ZONE);
    expect(detector.tilt().x).toBeCloseTo(expectedLength, 1);
  });

  it.each(["w3c", "inverted"] as const)(
    "gives the same tilt for both gravity sign conventions (%s)",
    (rawSigns: Trace["rawSigns"]) => {
      const spec = { durationMs: DURATION, roll: ease(0, 15, MOVE_START, MOVE_END) };
      const expected = run(poseReadings(tiltSamples(spec)));
      expect(run(poseReadings(tiltSamples({ ...spec, rawSigns })))).toEqual(expected);
    },
  );
});
