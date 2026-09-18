import { describe, expect, it } from "vitest";
import { createPoseTracker } from "@couchcade/motion/calibration";
import {
  AIM_PITCH_RANGE_DEG,
  AIM_YAW_RANGE_DEG,
  type AimReading,
  createAimDetector,
} from "@couchcade/motion/gestures";
import type { Trace } from "@couchcade/motion/sensors";
import { aimSamples, CALIBRATION_MS, calibrated, ease, poseReadings } from "./traces.ts";

/** Pushes every reading and returns what the detector emitted. */
function run(
  readings: ReturnType<typeof poseReadings>,
  detector = createAimDetector(),
): AimReading[] {
  const emitted: AimReading[] = [];
  detector.on((reading) => emitted.push(reading));
  for (const reading of readings) detector.push(reading);
  return emitted;
}

/** Turning moves in the second after calibration, then holding still for half a second. */
const MOVE_START = CALIBRATION_MS + 100;
const MOVE_END = CALIBRATION_MS + 1100;
const DURATION = CALIBRATION_MS + 1600;

describe("createAimDetector", () => {
  it("reads a still phone as the centre and emits nothing", () => {
    const detector = createAimDetector();
    const emitted = run(poseReadings(aimSamples({ durationMs: DURATION })), detector);
    expect(emitted).toEqual([]);
    expect(detector.aim()).toEqual({ yaw: 0, pitch: 0 });
  });

  it.each([
    ["right", 12.5, 0.5],
    ["left", -12.5, -0.5],
    ["right to the edge of the range", AIM_YAW_RANGE_DEG, 1],
  ])("turning %s gives yaw relative to the recentre point", (_, degrees, yaw) => {
    const detector = createAimDetector();
    const heading = ease(0, degrees, MOVE_START, MOVE_END);
    run(poseReadings(aimSamples({ durationMs: DURATION, heading })), detector);
    expect(detector.aim().yaw).toBeCloseTo(yaw, 1);
    expect(Math.abs(detector.aim().pitch)).toBeLessThanOrEqual(0.02);
  });

  it.each([
    ["up", 7.5, 0.5],
    ["down", -7.5, -0.5],
  ])("tipping the top edge %s gives pitch relative to the recentre point", (_, degrees, pitch) => {
    const detector = createAimDetector();
    const elevation = ease(10, 10 + degrees, MOVE_START, MOVE_END);
    run(poseReadings(aimSamples({ durationMs: DURATION, elevation })), detector);
    expect(detector.aim().pitch).toBeCloseTo(pitch, 1);
    expect(Math.abs(detector.aim().yaw)).toBeLessThanOrEqual(0.02);
  });

  it("maps ±25° of yaw and ±15° of pitch to ±1 and clamps beyond", () => {
    expect([AIM_YAW_RANGE_DEG, AIM_PITCH_RANGE_DEG]).toEqual([25, 15]);
    const detector = createAimDetector();
    const heading = ease(0, -40, MOVE_START, MOVE_END);
    const elevation = ease(10, 35, MOVE_START, MOVE_END);
    const emitted = run(
      poseReadings(aimSamples({ durationMs: DURATION, heading, elevation })),
      detector,
    );
    expect(detector.aim()).toEqual({ yaw: -1, pitch: 1 });
    for (const { yaw, pitch } of emitted) {
      expect(Math.abs(yaw)).toBeLessThanOrEqual(1);
      expect(Math.abs(pitch)).toBeLessThanOrEqual(1);
    }
  });

  it("takes game ranges", () => {
    const detector = createAimDetector({ yawRangeDeg: 50, pitchRangeDeg: 30 });
    const heading = ease(0, 25, MOVE_START, MOVE_END);
    const elevation = ease(10, 25, MOVE_START, MOVE_END);
    run(poseReadings(aimSamples({ durationMs: DURATION, heading, elevation })), detector);
    expect(detector.aim().yaw).toBeCloseTo(0.5, 1);
    expect(detector.aim().pitch).toBeCloseTo(0.5, 1);
  });

  it("emits -1..1 values rounded to 3 decimals, only when they change", () => {
    const heading = ease(0, 20, MOVE_START, MOVE_END);
    const elevation = ease(10, 0, MOVE_START, MOVE_END);
    const emitted = run(poseReadings(aimSamples({ durationMs: DURATION, heading, elevation })));
    expect(emitted.length).toBeGreaterThan(10);
    for (const reading of emitted) {
      expect(Object.keys(reading).toSorted()).toEqual(["pitch", "t", "yaw"]);
      expect(Math.round(reading.yaw * 1000) / 1000).toBe(reading.yaw);
      expect(Math.round(reading.pitch * 1000) / 1000).toBe(reading.pitch);
    }
    const steps = emitted.slice(1).map((reading, index) => {
      const previous = emitted[index] ?? reading;
      return {
        changed: reading.yaw !== previous.yaw || reading.pitch !== previous.pitch,
        later: reading.t > previous.t,
      };
    });
    expect(steps.every((step) => step.changed && step.later)).toBe(true);
  });

  it("doesn't move when the wrist rolls", () => {
    const detector = createAimDetector();
    const roll = ease(0, 45, MOVE_START, MOVE_END);
    run(poseReadings(aimSamples({ durationMs: DURATION, roll })), detector);
    expect(Math.abs(detector.aim().yaw)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(detector.aim().pitch)).toBeLessThanOrEqual(0.02);
  });

  it.each(["w3c", "inverted"] as const)(
    "gives the same aim for both gravity sign conventions (%s)",
    (rawSigns: Trace["rawSigns"]) => {
      const spec = {
        durationMs: DURATION,
        heading: ease(0, 15, MOVE_START, MOVE_END),
        elevation: ease(10, 16, MOVE_START, MOVE_END),
      };
      const expected = run(poseReadings(aimSamples(spec)));
      expect(run(poseReadings(aimSamples({ ...spec, rawSigns })))).toEqual(expected);
    },
  );

  describe("recentring", () => {
    const spec = {
      durationMs: CALIBRATION_MS + 2600,
      heading: (t: number) =>
        ease(0, 10, MOVE_START, MOVE_END)(t) + ease(0, 5, MOVE_END + 400, MOVE_END + 1400)(t),
    };

    it("makes the current pose the centre and emits it at the recentre time", () => {
      const readings = poseReadings(aimSamples(spec));
      const detector = createAimDetector();
      const emitted: AimReading[] = [];
      detector.on((reading) => emitted.push(reading));

      const before = readings.filter((r) => r.t <= MOVE_END + 200);
      for (const reading of before) detector.push(reading);
      expect(detector.aim().yaw).toBeCloseTo(0.4, 1);

      detector.recentre(MOVE_END + 210);
      expect(detector.aim()).toEqual({ yaw: 0, pitch: 0 });
      expect(emitted.at(-1)).toEqual({ t: MOVE_END + 210, yaw: 0, pitch: 0 });

      for (const reading of readings.filter((r) => r.t > MOVE_END + 200)) detector.push(reading);
      expect(detector.aim().yaw).toBeCloseTo(0.2, 1);
    });

    it("recentres on a trace mark", () => {
      const readings = poseReadings(aimSamples(spec));
      const detector = createAimDetector();
      let marked = false;
      let yawAtMark = Number.NaN;
      for (const reading of readings) {
        if (!marked && reading.t > MOVE_END + 200) {
          marked = true;
          detector.mark({ type: "grip-down", t: reading.t });
          yawAtMark = detector.aim().yaw;
          detector.mark({ type: "recentre", t: reading.t });
        }
        detector.push(reading);
      }
      expect(marked).toBe(true);
      expect(yawAtMark).toBeCloseTo(0.4, 1);
      expect(detector.aim().yaw).toBeCloseTo(0.2, 1);
    });

    it("uses the next reading as the centre when there is no pose yet, and after reset", () => {
      const heading = ease(10, 20, MOVE_START, MOVE_END);
      const readings = poseReadings(aimSamples({ durationMs: DURATION, heading }));
      const detector = createAimDetector();
      detector.recentre();
      run(readings, detector);
      expect(detector.aim().yaw).toBeCloseTo(0.4, 1);

      detector.reset();
      expect(detector.aim()).toEqual({ yaw: 0, pitch: 0 });
      const last = readings.at(-1);
      if (!last) throw new Error("no readings");
      detector.push(last);
      expect(detector.aim()).toEqual({ yaw: 0, pitch: 0 });
    });

    it("clears the yaw drift a gyroscope bias builds up, while gravity keeps pitch honest", () => {
      // 0.5 deg/s of bias around every axis that calibration never saw, for 20 seconds.
      const trace = calibrated(
        aimSamples({
          durationMs: CALIBRATION_MS + 20_000,
          drift: (t) => (t > CALIBRATION_MS ? [0.5, 0.5, 0.5] : [0, 0, 0]),
        }),
      );
      const tracker = createPoseTracker(trace.calibration);
      const detector = createAimDetector();
      for (const sample of trace.samples) detector.push(tracker.push(sample));

      expect(Math.abs(detector.aim().yaw)).toBeGreaterThan(0.2);
      expect(Math.abs(detector.aim().pitch)).toBeLessThanOrEqual(0.05);

      detector.recentre();
      expect(detector.aim()).toEqual({ yaw: 0, pitch: 0 });
    });
  });
});
