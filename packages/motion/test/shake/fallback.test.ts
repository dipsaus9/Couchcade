import { describe, expect, it } from "vitest";
import {
  createShakeButton,
  type PointerPoint,
  type ShakeButtonOptions,
} from "@couchcade/motion/fallbacks";
import {
  createShakeDetector,
  SHAKE_COOLDOWN_MS,
  type Shake,
  type ShakeSource,
} from "@couchcade/motion/gestures";
import { replay, shakeTrace } from "./traces.ts";

const localTime = (t: number) => t;

const button = (options: ShakeButtonOptions = {}) =>
  createShakeButton({ toRoomTime: localTime, ...options });

/** Pushes each point and records what was emitted, and after which point. */
function play(points: PointerPoint[], source: ShakeSource<PointerPoint>) {
  const emitted: Array<{ shake: Shake; t: number; after: number }> = [];
  let index = 0;
  const off = source.on((shake, t) => emitted.push({ shake, t, after: index }));
  for (const point of points) {
    source.push(point);
    index++;
  }
  off();
  return emitted;
}

const down = (t: number): PointerPoint => ({ t, x: 0, y: 0, type: "down" });
const up = (t: number): PointerPoint => ({ t, x: 0, y: 0, type: "up" });

/** Field names and types, sorted. */
const shape = (value: object) =>
  Object.entries(value)
    .map(([key, field]) => `${key}:${typeof field}`)
    .toSorted();

describe("createShakeButton", () => {
  it("emits { at } at once, with the pointerdown time", () => {
    const emitted = play([down(1000)], button());
    expect(emitted).toEqual([{ shake: { at: 1000 }, t: 1000, after: 0 }]);
  });

  it("ignores move, up and cancel", () => {
    const pad = button();
    expect(
      play(
        [{ t: 0, x: 0, y: 0, type: "move" }, up(10), { t: 20, x: 0, y: 0, type: "cancel" }],
        pad,
      ),
    ).toEqual([]);
  });

  it("ignores a press within 700 ms of the last one, then allows the next", () => {
    expect(SHAKE_COOLDOWN_MS).toBe(700);
    const pad = button();
    expect(play([down(0)], pad)).toHaveLength(1);
    expect(play([down(500)], pad)).toEqual([]);
    expect(play([down(700)], pad)).toHaveLength(1);
  });

  it("reset forgets the cooldown, and keeps the listeners", () => {
    const pad = button();
    expect(play([down(0)], pad)).toHaveLength(1);
    pad.reset();
    expect(play([down(10)], pad)).toHaveLength(1);
  });

  it("takes a game-tuned cooldown", () => {
    const pad = button({ cooldownMs: 100 });
    expect(play([down(0)], pad)).toHaveLength(1);
    expect(play([down(50)], pad)).toEqual([]);
    expect(play([down(150)], pad)).toHaveLength(1);
  });
});

describe("fallback emits the same shape as the motion detector", () => {
  it("button and shake detector events have the same fields and types", () => {
    const [motion] = replay(
      shakeTrace({ peak: 20 }),
      createShakeDetector({ toRoomTime: localTime }),
    );
    const [pressed] = play([down(0)], button());
    if (!motion || !pressed) throw new Error("nothing emitted");
    const expected = ["at:number"];
    expect(shape(motion.shake)).toEqual(expected);
    expect(shape(pressed.shake)).toEqual(expected);
    expect([typeof motion.t, typeof pressed.t]).toEqual(["number", "number"]);
  });
});
