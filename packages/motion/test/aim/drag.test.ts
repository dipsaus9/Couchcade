import { describe, expect, it } from "vitest";
import { createAimDrag, type PointerPoint } from "@couchcade/motion/fallbacks";
import { type AimReading, createAimDetector } from "@couchcade/motion/gestures";
import { aimSamples, CALIBRATION_MS, ease, poseReadings } from "./traces.ts";

/** A recorded-style pointer path: down at the first point, moves, up at the last. */
function path(points: Array<[t: number, x: number, y: number]>): PointerPoint[] {
  return points.map(([t, x, y], index) => ({
    t,
    x,
    y,
    type: index === 0 ? "down" : index === points.length - 1 ? "up" : "move",
  }));
}

function drag(points: PointerPoint[], aim = createAimDrag()) {
  const emitted: AimReading[] = [];
  const off = aim.on((reading) => emitted.push(reading));
  for (const point of points) aim.push(point);
  off();
  return { aim, emitted };
}

/** Field names and types, sorted. */
const shape = (value: object) =>
  Object.entries(value)
    .map(([key, field]) => `${key}:${typeof field}`)
    .toSorted();

describe("createAimDrag", () => {
  it("maps 200 px across the whole yaw range and 150 px across the whole pitch range", () => {
    const { aim, emitted } = drag(
      path([
        [0, 100, 300],
        [16, 125, 290],
        [33, 150, 262.5],
        [50, 150, 262.5],
      ]),
    );
    // 50 px right is a quarter of 200 px across −1..1, and 37.5 px up a quarter of 150 px.
    expect(aim.aim()).toEqual({ yaw: 0.5, pitch: 0.5 });
    expect(emitted).toEqual([
      { t: 16, yaw: 0.25, pitch: 0.13 },
      { t: 33, yaw: 0.5, pitch: 0.5 },
    ]);
  });

  it("moves relative to where the aim was, like a touchpad", () => {
    const aim = createAimDrag();
    drag(
      path([
        [0, 50, 50],
        [20, 30, 50],
        [40, 30, 50],
      ]),
      aim,
    );
    expect(aim.aim()).toEqual({ yaw: -0.2, pitch: 0 });
    drag(
      path([
        [500, 200, 400],
        [520, 190, 430],
        [540, 190, 430],
      ]),
      aim,
    );
    expect(aim.aim()).toEqual({ yaw: -0.3, pitch: -0.4 });
  });

  it("clamps to ±1 and moves back from an edge at once", () => {
    const aim = createAimDrag();
    drag(
      path([
        [0, 0, 0],
        [20, 400, -300],
        [40, 390, -290],
      ]),
      aim,
    );
    // 400 px right and 300 px up pin both at 1; 10 px back moves off the edge straight away.
    expect(aim.aim()).toEqual({ yaw: 0.9, pitch: 0.87 });
  });

  it("ignores moves without a finger down", () => {
    const aim = createAimDrag();
    const { emitted } = drag(
      [
        { t: 0, x: 0, y: 0, type: "move" },
        { t: 10, x: 0, y: 0, type: "down" },
        { t: 20, x: 20, y: 0, type: "cancel" },
        { t: 30, x: 80, y: 0, type: "move" },
        { t: 40, x: 80, y: 0, type: "up" },
      ],
      aim,
    );
    expect(emitted).toEqual([{ t: 20, yaw: 0.2, pitch: 0 }]);
  });

  it("recentres to 0 at the Centre tap's time, and reset forgets the aim", () => {
    const aim = createAimDrag();
    const emitted: AimReading[] = [];
    aim.on((reading) => emitted.push(reading));
    drag(
      path([
        [0, 0, 0],
        [20, 40, 30],
        [40, 40, 30],
      ]),
      aim,
    );
    aim.recentre(900);
    expect(aim.aim()).toEqual({ yaw: 0, pitch: 0 });
    expect(emitted.at(-1)).toEqual({ t: 900, yaw: 0, pitch: 0 });

    drag(
      path([
        [1000, 0, 0],
        [1020, 10, 0],
        [1040, 10, 0],
      ]),
      aim,
    );
    aim.reset();
    expect(aim.aim()).toEqual({ yaw: 0, pitch: 0 });
  });

  it("emits the same shape as the motion detector", () => {
    const motion = createAimDetector();
    const motionReadings: AimReading[] = [];
    motion.on((reading) => motionReadings.push(reading));
    const heading = ease(0, 10, CALIBRATION_MS + 100, CALIBRATION_MS + 600);
    for (const reading of poseReadings(aimSamples({ durationMs: CALIBRATION_MS + 800, heading }))) {
      motion.push(reading);
    }

    const { aim, emitted } = drag(
      path([
        [0, 0, 0],
        [16, 40, 0],
        [32, 40, 0],
      ]),
    );
    const motionLast = motionReadings.at(-1);
    const dragLast = emitted.at(-1);
    if (!motionLast || !dragLast) throw new Error("nothing emitted");
    expect(shape(dragLast)).toEqual(shape(motionLast));
    expect(shape(aim.aim())).toEqual(shape(motion.aim()));
    expect(shape(aim.aim())).toEqual(["pitch:number", "yaw:number"]);
    // Same aim, same value: a game can't tell which control the player used.
    expect(aim.aim()).toEqual(motion.aim());
  });
});
