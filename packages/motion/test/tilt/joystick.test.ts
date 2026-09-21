import { describe, expect, it } from "vitest";
import { createTiltJoystick, type JoystickVector } from "@couchcade/motion/fallbacks";
import { TILT_DEAD_ZONE, type TiltReading, createTiltDetector } from "@couchcade/motion/gestures";
import { CALIBRATION_MS, ease, poseReadings, tiltSamples } from "./traces.ts";

function drag(vectors: JoystickVector[], tilt = createTiltJoystick()) {
  const emitted: TiltReading[] = [];
  const off = tilt.on((reading) => emitted.push(reading));
  for (const vector of vectors) tilt.push(vector);
  off();
  return { tilt, emitted };
}

/** Field names and types, sorted. */
const shape = (value: object) =>
  Object.entries(value)
    .map(([key, field]) => `${key}:${typeof field}`)
    .toSorted();

describe("createTiltJoystick", () => {
  it("stays at rest inside the dead zone", () => {
    const { tilt, emitted } = drag([
      { t: 0, x: 0.1, y: 0.05 },
      { t: 16, x: 0.12, y: 0 },
    ]);
    expect(emitted).toEqual([]);
    expect(tilt.tilt()).toEqual({ x: 0, y: 0 });
  });

  it("rescales past the dead zone, keeping the direction", () => {
    const { tilt } = drag([{ t: 0, x: 1, y: 0 }]);
    expect(tilt.tilt()).toEqual({ x: 1, y: 0 });

    const half = drag([{ t: 0, x: 0.5, y: 0 }]);
    // (0.5 - 0.15) / (1 - 0.15) rounded to 0.05.
    const expected = Math.round((0.5 - TILT_DEAD_ZONE) / (1 - TILT_DEAD_ZONE) / 0.05) * 0.05;
    expect(half.tilt.tilt().x).toBeCloseTo(expected, 5);
  });

  it("right is positive x, up the screen is positive y", () => {
    expect(drag([{ t: 0, x: 1, y: 0 }]).tilt.tilt()).toEqual({ x: 1, y: 0 });
    expect(drag([{ t: 0, x: -1, y: 0 }]).tilt.tilt()).toEqual({ x: -1, y: 0 });
    expect(drag([{ t: 0, x: 0, y: 1 }]).tilt.tilt()).toEqual({ x: 0, y: 1 });
    expect(drag([{ t: 0, x: 0, y: -1 }]).tilt.tilt()).toEqual({ x: 0, y: -1 });
  });

  it("releasing the stick (x: 0, y: 0) settles back at rest", () => {
    const tilt = createTiltJoystick();
    drag([{ t: 0, x: 0.8, y: -0.6 }], tilt);
    expect(tilt.tilt().x).toBeGreaterThan(0);
    drag([{ t: 16, x: 0, y: 0 }], tilt);
    expect(tilt.tilt()).toEqual({ x: 0, y: 0 });
  });

  it("emits only when the rounded value changes", () => {
    const { emitted } = drag([
      { t: 0, x: 0.8, y: 0 },
      { t: 16, x: 0.801, y: 0 },
      { t: 32, x: 0.9, y: 0 },
    ]);
    expect(emitted).toHaveLength(2);
  });

  it("reset forgets the tilt", () => {
    const tilt = createTiltJoystick();
    drag([{ t: 0, x: 0.8, y: 0 }], tilt);
    tilt.reset();
    expect(tilt.tilt()).toEqual({ x: 0, y: 0 });
  });

  it("takes a game range, matching the detector's option", () => {
    const tilt = createTiltJoystick({ deadZone: 0.5 });
    drag([{ t: 0, x: 0.4, y: 0 }], tilt);
    expect(tilt.tilt()).toEqual({ x: 0, y: 0 });
  });

  it("emits the same shape as the motion detector, for the same shape of input", () => {
    const motion = createTiltDetector();
    const motionReadings: TiltReading[] = [];
    motion.on((reading) => motionReadings.push(reading));
    const roll = ease(0, 20, CALIBRATION_MS + 100, CALIBRATION_MS + 600);
    for (const reading of poseReadings(tiltSamples({ durationMs: CALIBRATION_MS + 800, roll }))) {
      motion.push(reading);
    }

    const { tilt, emitted } = drag([
      { t: 0, x: 0, y: 0 },
      { t: 16, x: 0.7, y: 0 },
    ]);

    const motionLast = motionReadings.at(-1);
    const dragLast = emitted.at(-1);
    if (!motionLast || !dragLast) throw new Error("nothing emitted");
    // A game can't tell which control the player used: same fields, same types.
    expect(shape(dragLast)).toEqual(shape(motionLast));
    expect(shape(tilt.tilt())).toEqual(shape(motion.tilt()));
    expect(shape(tilt.tilt())).toEqual(["x:number", "y:number"]);
  });
});
