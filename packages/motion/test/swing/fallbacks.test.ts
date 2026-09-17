import { describe, expect, it } from "vitest";
import {
  createSwingSwipe,
  createSwingTap,
  type PointerPoint,
  SWIPE_ANGLE_TAIL_PX,
  SWIPE_FAST_PX_PER_S,
  SWIPE_MIN_PX,
  SWIPE_SLOW_PX_PER_S,
  type SwingSwipeOptions,
} from "@couchcade/motion/fallbacks";
import { createSwingDetector, type Swing, type SwingSource } from "@couchcade/motion/gestures";
import { replay, swingTrace } from "./traces.ts";

const localTime = (t: number) => t;

/** A recorded-style pointer path: down at the first point, moves, up at the last. */
function path(points: Array<[t: number, x: number, y: number]>): PointerPoint[] {
  return points.map(([t, x, y], index) => ({
    t,
    x,
    y,
    type: index === 0 ? "down" : index === points.length - 1 ? "up" : "move",
  }));
}

/** A straight swipe from `(x, y)` moving `(dx, dy)` px every 10 ms for `steps` steps. */
function straight(
  from: [t: number, x: number, y: number],
  dx: number,
  dy: number,
  steps: number,
): Array<[number, number, number]> {
  const [t, x, y] = from;
  return Array.from({ length: steps + 1 }, (_, i) => [t + i * 10, x + i * dx, y + i * dy]);
}

type Emitted = Array<{ swing: Swing; t: number; after: number }>;

/** Pushes each point and records what was emitted, and after which point. */
function play(points: PointerPoint[], source: SwingSource<PointerPoint>): Emitted {
  const emitted: Emitted = [];
  let index = 0;
  const off = source.on((swing, t) => emitted.push({ swing, t, after: index }));
  for (const point of points) {
    source.push(point);
    index++;
  }
  off();
  return emitted;
}

const swipe = (options: SwingSwipeOptions = {}) =>
  createSwingSwipe({ toRoomTime: localTime, ...options });

/** A half circle of radius 50 up the pad from (100, 500) to (100, 400), bulging to `side`. */
const arc = (side: 1 | -1) =>
  Array.from({ length: 13 }, (_, i): [number, number, number] => {
    const a = (Math.PI * i) / 12;
    return [i * 10, 100 + side * 50 * Math.sin(a), 450 + 50 * Math.cos(a)];
  });

const down = (t: number, x: number): PointerPoint => ({ t, x, y: 0, type: "down" });

/** Field names and types, sorted. */
const shape = (value: object) =>
  Object.entries(value)
    .map(([key, field]) => `${key}:${typeof field}`)
    .toSorted();

describe("createSwingSwipe", () => {
  it("turns a straight swipe up into a straight swing", () => {
    // 20 px every 10 ms is 2,000 px/s: (2000 − 300) / (2400 − 300) = 0.81.
    const emitted = play(path(straight([1000, 150, 400], 0, -20, 10)), swipe());
    expect(emitted).toEqual([
      { swing: { speed: 0.81, angle: 0, spin: 0, peakAt: 1050 }, t: 1050, after: 10 },
    ]);
  });

  it("maps peak finger speed from 300 px/s to 2,400 px/s, clamped", () => {
    expect([SWIPE_MIN_PX, SWIPE_SLOW_PX_PER_S, SWIPE_FAST_PX_PER_S]).toEqual([60, 300, 2400]);
    const speedOf = (dy: number, steps: number) =>
      play(path(straight([0, 100, 500], 0, dy, steps)), swipe({ emitOn: "release" }))[0]?.swing
        .speed;
    expect(speedOf(-3, 30)).toBe(0); // 300 px/s
    expect(speedOf(-2, 40)).toBe(0); // 200 px/s: slow, but long enough to be a swing
    expect(speedOf(-24, 10)).toBe(1); // 2,400 px/s
    expect(speedOf(-40, 6)).toBe(1); // 4,000 px/s adds nothing
  });

  it("times peakAt at the fastest 50 ms window", () => {
    // Slow, then a burst of 20 px per 10 ms between 1060 and 1110, then slow again.
    const points: Array<[number, number, number]> = [
      ...straight([1000, 100, 500], 0, -5, 6),
      ...straight([1060, 100, 470], 0, -20, 5).slice(1),
      ...straight([1110, 100, 370], 0, -5, 6).slice(1),
    ];
    const [emitted] = play(path(points), swipe({ emitOn: "release" }));
    expect(emitted?.swing.peakAt).toBe(1110);
    expect(emitted?.swing.speed).toBe(0.81);
  });

  it("emits nothing for swipes shorter than 60 px, swipes down, and a cancelled touch", () => {
    const pad = swipe({ emitOn: "release" });
    expect(play(path(straight([0, 100, 500], 0, -11, 5)), pad)).toEqual([]); // 55 px
    expect(play(path(straight([500, 100, 100], 0, 20, 10)), pad)).toEqual([]); // down
    const cancelled = path(straight([1000, 100, 500], 0, -20, 10));
    cancelled[cancelled.length - 1] = { ...(cancelled.at(-1) as PointerPoint), type: "cancel" };
    expect(play(cancelled, pad)).toEqual([]);
    expect(
      play(
        [
          { t: 2000, x: 0, y: 0, type: "move" },
          { t: 2010, x: 0, y: -90, type: "up" },
        ],
        pad,
      ),
    ).toEqual([]);
  });

  it("takes the angle from the last 80 px of the swipe", () => {
    expect(SWIPE_ANGLE_TAIL_PX).toBe(80);
    // 100 px straight up, then 90 px up and to the right at 45°.
    const right = [
      ...straight([0, 100, 500], 0, -20, 5),
      ...straight([50, 100, 400], 15, -15, 6).slice(1),
    ];
    const left = right.map(([t, x, y]): [number, number, number] => [t, 200 - x, y]);
    const pad = swipe({ emitOn: "release" });
    expect(play(path(right), pad)[0]?.swing.angle).toBe(45);
    expect(play(path(left), pad)[0]?.swing.angle).toBe(-45);
  });

  it("takes spin from how far the path bends, positive to the right", () => {
    // A half circle of radius 50 from (100, 500) to (100, 400) through (150, 450) bends fully right.
    const pad = swipe({ emitOn: "release" });
    expect(play(path(arc(1)), pad)[0]?.swing.spin).toBe(1);
    expect(play(path(arc(-1)), pad)[0]?.swing.spin).toBe(-1);

    // A gentle bend: the midpoint 10 px right of a 100 px chord is 10 / 50.
    const gentle: Array<[number, number, number]> = [
      [0, 100, 500],
      [20, 105, 475],
      [40, 110, 450],
      [60, 105, 425],
      [80, 100, 400],
    ];
    expect(play(path(gentle), pad)[0]?.swing.spin).toBe(0.2);
  });

  it('"release" emits only when the finger lifts', () => {
    const emitted = play(path(straight([0, 100, 500], 0, -20, 10)), swipe({ emitOn: "release" }));
    expect(emitted.map(({ after }) => after)).toEqual([10]);
  });

  it('"peak" emits once the swipe passed 60 px and slowed to under half its peak speed', () => {
    const points: Array<[number, number, number]> = [
      ...straight([0, 100, 500], 0, -25, 6), // 150 px at 2,500 px/s
      ...straight([60, 100, 350], 0, -2, 12).slice(1), // then the thumb slows to 200 px/s
    ];
    const emitted = play(path(points), swipe({ emitOn: "peak" }));
    expect(emitted).toHaveLength(1);
    const [{ swing, after }] = emitted as [Emitted[number]];
    expect(after).toBeLessThan(points.length - 1);
    expect(swing.speed).toBe(1);
    expect(swing.peakAt).toBe(50);
  });

  it('"peak" emits one swing per touch, on lift if the finger never slowed, with a 400 ms cooldown', () => {
    const pad = swipe({ emitOn: "peak" });
    expect(play(path(straight([0, 100, 500], 0, -20, 10)), pad)).toHaveLength(1);
    expect(play(path(straight([300, 100, 500], 0, -20, 10)), pad)).toEqual([]);
    expect(play(path(straight([600, 100, 500], 0, -20, 10)), pad)).toHaveLength(1);
    pad.reset();
    expect(play(path(straight([700, 100, 500], 0, -20, 10)), pad)).toHaveLength(1);
  });

  it("ignores a second finger while one is down", () => {
    const pad = swipe({ emitOn: "release" });
    const points = path(straight([0, 100, 500], 0, -20, 10));
    points.splice(3, 0, { t: 25, x: 300, y: 900, type: "down" });
    expect(play(points, pad)[0]?.swing.angle).toBe(0);
  });
});

describe("createSwingTap", () => {
  const pad = { left: 20, width: 300 };

  it("emits { speed: 0.7, angle: ±60, spin: 0 } at the pointerdown time", () => {
    const tap = createSwingTap({ pad, toRoomTime: localTime });
    const emitted = play(
      [
        { t: 1000, x: 100, y: 300, type: "down" },
        { t: 1080, x: 110, y: 300, type: "up" },
        { t: 2000, x: 200, y: 300, type: "down" },
        { t: 2050, x: 200, y: 300, type: "move" },
        { t: 2070, x: 200, y: 300, type: "up" },
      ],
      tap,
    );
    expect(emitted).toEqual([
      { swing: { speed: 0.7, angle: -60, spin: 0, peakAt: 1000 }, t: 1000, after: 0 },
      { swing: { speed: 0.7, angle: 60, spin: 0, peakAt: 2000 }, t: 2000, after: 2 },
    ]);
  });

  it("reads the pad at each tap and ignores taps within 400 ms", () => {
    let bounds = { left: 0, width: 400 };
    const tap = createSwingTap({ pad: () => bounds, toRoomTime: localTime });
    expect(play([down(0, 150)], tap).map(({ swing }) => swing.angle)).toEqual([-60]);
    expect(play([down(300, 150)], tap)).toEqual([]);
    bounds = { left: 0, width: 200 };
    expect(play([down(500, 150)], tap).map(({ swing }) => swing.angle)).toEqual([60]);
    tap.reset();
    expect(play([down(600, 50)], tap)).toHaveLength(1);
  });
});

describe("fallbacks emit the same shape as the motion detector", () => {
  it("swipe, tap and swing detector events have the same fields and types", () => {
    const [motion] = replay(
      swingTrace({ peak: 700 }),
      createSwingDetector({ toRoomTime: localTime }),
    );
    const [swiped] = play(path(straight([0, 100, 500], 0, -20, 10)), swipe());
    const [tapped] = play(
      [{ t: 0, x: 10, y: 10, type: "down" }],
      createSwingTap({ pad: { left: 0, width: 100 }, toRoomTime: localTime }),
    );
    if (!motion || !swiped || !tapped) throw new Error("nothing emitted");
    const expected = ["angle:number", "peakAt:number", "speed:number", "spin:number"];
    expect(shape(motion.swing)).toEqual(expected);
    expect(shape(swiped.swing)).toEqual(expected);
    expect(shape(tapped.swing)).toEqual(expected);
    expect([typeof motion.t, typeof swiped.t, typeof tapped.t]).toEqual([
      "number",
      "number",
      "number",
    ]);
  });
});
