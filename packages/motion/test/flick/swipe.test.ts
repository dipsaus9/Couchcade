import { describe, expect, it } from "vitest";
import {
  createFlickSwipe,
  createSwingSwipe,
  FLICK_SWIPE_WOBBLE_SCALE,
  type FlickSwipeOptions,
  type PointerPoint,
} from "@couchcade/motion/fallbacks";
import { createFlickDetector, type Flick, type FlickSource } from "@couchcade/motion/gestures";
import { flickTrace, replay } from "./traces.ts";

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

type Emitted = Array<{ flick: Flick; t: number; after: number }>;

/** Pushes each point and records what was emitted, and after which point. */
function play(points: PointerPoint[], source: FlickSource<PointerPoint>): Emitted {
  const emitted: Emitted = [];
  let index = 0;
  const off = source.on((flick, t) => emitted.push({ flick, t, after: index }));
  for (const point of points) {
    source.push(point);
    index++;
  }
  off();
  return emitted;
}

const swipe = (options: FlickSwipeOptions = {}) =>
  createFlickSwipe({ toRoomTime: localTime, ...options });

/** Field names and types, sorted. */
const shape = (value: object) =>
  Object.entries(value)
    .map(([key, field]) => `${key}:${typeof field}`)
    .toSorted();

// A straight 100 px swipe up with a sharp 10 px kink to one side at its midpoint.
const kinked = (side: 1 | -1): Array<[number, number, number]> => [
  [0, 100, 500],
  [25, 100 + side * 10, 450],
  [50, 100, 400],
];

describe("createFlickSwipe", () => {
  it("throws a straight swipe up straight, when the finger lifts", () => {
    // 20 px every 10 ms is 2,000 px/s: (2000 − 300) / (2400 − 300) = 0.81.
    const emitted = play(path(straight([1000, 150, 400], 0, -20, 10)), swipe());
    expect(emitted).toEqual([
      { flick: { power: 0.81, direction: 0, wobble: 0, at: 1050 }, t: 1050, after: 10 },
    ]);
  });

  it("uses the swing swipe's finger speed mapping for power", () => {
    const paths = [
      straight([0, 100, 500], 0, -3, 30), // 300 px/s
      straight([0, 100, 500], 0, -9, 12), // 900 px/s
      straight([0, 100, 500], 7, -14, 10),
      straight([0, 100, 500], 0, -40, 6), // 4,000 px/s adds nothing
    ];
    const powers = paths.map((points) => play(path(points), swipe())[0]?.flick.power);
    const speeds = paths.map((points) => {
      const emitted: number[] = [];
      const pad = createSwingSwipe({ emitOn: "release", toRoomTime: localTime });
      pad.on((swing) => emitted.push(swing.speed));
      for (const point of path(points)) pad.push(point);
      return emitted[0];
    });
    expect(powers).toEqual(speeds);
    expect(powers).toEqual([0, 0.29, 0.6, 1]);
  });

  it("times at at the fastest 50 ms window", () => {
    const points: Array<[number, number, number]> = [
      ...straight([1000, 100, 500], 0, -5, 6),
      ...straight([1060, 100, 470], 0, -20, 5).slice(1),
      ...straight([1110, 100, 370], 0, -5, 6).slice(1),
    ];
    const [emitted] = play(path(points), swipe());
    expect(emitted?.flick.at).toBe(1110);
    expect(emitted?.t).toBe(1110);
  });

  it("emits nothing for swipes shorter than 60 px, swipes down, and a cancelled touch", () => {
    const pad = swipe();
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

  it("takes the direction from the start to the end of the swipe, clamped to ±30°", () => {
    const directionOf = (dx: number) =>
      play(path(straight([0, 100, 500], dx, -20, 10)), swipe())[0]?.flick.direction;
    expect(directionOf(10)).toBe(27); // atan2(10, 20)
    expect(directionOf(-10)).toBe(-27);
    expect(directionOf(20)).toBe(30); // 45° clamped
    expect(directionOf(-20)).toBe(-30);
  });

  it("takes wobble from the RMS sideways distance over the swipe length, times 4", () => {
    expect(FLICK_SWIPE_WOBBLE_SCALE).toBe(4);
    // The sideways distance rises evenly from 0 to 10 px and back: its RMS is about 10 / √3.
    const wobble = play(path(kinked(1)), swipe())[0]?.flick.wobble;
    expect(wobble).toBe(0.23);
    expect(play(path(kinked(-1)), swipe())[0]?.flick.wobble).toBe(wobble);

    // A half circle of radius 50 up the pad wanders far from its line: full wobble.
    const arc = Array.from({ length: 13 }, (_, i): [number, number, number] => {
      const a = (Math.PI * i) / 12;
      return [i * 10, 100 + 50 * Math.sin(a), 450 + 50 * Math.cos(a)];
    });
    expect(play(path(arc), swipe())[0]?.flick.wobble).toBe(1);
  });

  it("samples wobble evenly along the path, however the pointer events are spaced", () => {
    // The same path with many slow events on its first half.
    const dense: Array<[number, number, number]> = [
      ...Array.from({ length: 10 }, (_, i): [number, number, number] => [
        i * 10,
        100 + i,
        500 - i * 5,
      ]),
      [100, 110, 450],
      [125, 100, 400],
    ];
    expect(play(path(dense), swipe())[0]?.flick.wobble).toBe(
      play(path(kinked(1)), swipe())[0]?.flick.wobble,
    );
  });

  it("throws once per touch, with an 800 ms cooldown after each throw", () => {
    const pad = swipe();
    // The first throw's fastest window ends at 50.
    expect(play(path(straight([0, 100, 500], 0, -20, 10)), pad)).toHaveLength(1);
    expect(play(path(straight([500, 100, 500], 0, -20, 10)), pad)).toEqual([]);
    expect(play(path(straight([850, 100, 500], 0, -20, 10)), pad)).toHaveLength(1);
    pad.reset();
    expect(play(path(straight([950, 100, 500], 0, -20, 10)), pad)).toHaveLength(1);
  });

  it("ignores a second finger while one is down", () => {
    const pad = swipe();
    const points = path(straight([0, 100, 500], 0, -20, 10));
    points.splice(3, 0, { t: 25, x: 300, y: 900, type: "down" });
    expect(play(points, pad)).toEqual([
      { flick: { power: 0.81, direction: 0, wobble: 0, at: 50 }, t: 50, after: 11 },
    ]);
  });
});

describe("the swipe emits the same shape as the motion detector", () => {
  it("swipe and flick detector events have the same fields and types", () => {
    const [motion] = replay(
      flickTrace({ peak: 800 }),
      createFlickDetector({ toRoomTime: localTime }),
    );
    const [swiped] = play(path(straight([0, 100, 500], 5, -20, 10)), swipe());
    if (!motion || !swiped) throw new Error("nothing emitted");
    const expected = ["at:number", "direction:number", "power:number", "wobble:number"];
    expect(shape(motion.flick)).toEqual(expected);
    expect(shape(swiped.flick)).toEqual(expected);
    expect([typeof motion.t, typeof swiped.t]).toEqual(["number", "number"]);
  });
});
