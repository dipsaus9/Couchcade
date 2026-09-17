import { createInputStream } from "@couchcade/game-sdk/input";
import { createFakeAdapter } from "@couchcade/motion/sensors";
import { describe, expect, it } from "vitest";
import { createShotAim, type TargetRangeMotion } from "../../src/controller/aim.ts";
import { inputSchema, type TargetRangeInput } from "../../src/shared/input.ts";
import { virtualTime } from "./clock.ts";
import { flatCalibration, turn } from "./motion.ts";

const calibration = flatCalibration();

function setup() {
  const time = virtualTime();
  const sent: TargetRangeInput[] = [];
  const stream = createInputStream<TargetRangeInput>(
    (input) => {
      expect(inputSchema.safeParse(input).success).toBe(true);
      sent.push(input);
      return time.now();
    },
    { now: time.now, schedule: time.schedule },
  );
  const aim = createShotAim(stream, { now: time.now, schedule: time.schedule });
  const adapter = createFakeAdapter();
  const motion: TargetRangeMotion = { mode: "motion", adapter, calibration };
  /** Plays samples on virtual time, from now on. */
  const play = (durationMs: number, gamma: number) => {
    for (const sample of turn(time.now(), durationMs, gamma)) {
      time.advance(Math.max(0, sample.t - time.now()));
      adapter.push(sample);
    }
  };
  return { time, sent, aim, adapter, motion, play };
}

const types = (sent: TargetRangeInput[]) => sent.map((input) => input.type);

describe("createShotAim with motion", () => {
  it("sends nothing while the phone moves without a draw", () => {
    const { aim, motion, sent, play } = setup();
    aim.use(motion);
    expect(aim.mode()).toBe("motion");
    play(500, 40);
    expect(sent).toEqual([]);
  });

  it("recentres at the draw and sends the centre sample at once", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    play(500, 40);
    expect(aim.aim().yaw).not.toBe(0);

    aim.startDraw(time.now());
    expect(aim.aim()).toEqual({ yaw: 0, pitch: 0 });
    expect(sent).toEqual([{ type: "aim", payload: { aim: [[0, 0, 0]] } }]);
  });

  it("streams aim while drawing and shoots with the aim at release", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    play(200, 0);
    aim.startDraw(time.now());
    play(1000, 10);
    const released = aim.aim();
    expect(Math.abs(released.yaw)).toBeGreaterThan(0.2);
    expect(types(sent).filter((type) => type === "aim").length).toBeGreaterThan(2);
    // Stream cap: 4 messages a second.
    expect(sent.length).toBeLessThanOrEqual(5);

    const before = sent.length;
    aim.shoot(3, 0.8, time.now());
    time.advance(300);
    expect(sent.slice(before)).toEqual([
      { type: "shoot", payload: { volley: 3, aim: released, power: 0.8 } },
    ]);

    play(1000, 30);
    expect(sent.length).toBe(before + 1);
  });

  it("lowers the bow, and the next draw shows the crosshair again from the centre", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    aim.startDraw(time.now());
    aim.lower(1, time.now());
    time.advance(300);
    expect(sent).toEqual([
      { type: "aim", payload: { aim: [[0, 0, 0]] } },
      { type: "lower", payload: { volley: 1 } },
    ]);

    play(300, 0);
    aim.startDraw(time.now());
    time.advance(300);
    expect(sent.at(-1)).toEqual({ type: "aim", payload: { aim: [[0, 0, 0]] } });
    expect(sent).toHaveLength(3);
  });

  it("stops a draw when the volley closes without a message", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    aim.startDraw(time.now());
    aim.stop();
    play(1000, 30);
    time.advance(1000);
    expect(sent).toHaveLength(1);
  });

  it("keeps motion aim when the same result comes again, and ignores the pad", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    play(500, 40);
    const turned = aim.aim();
    aim.use({ ...motion });
    expect(aim.aim()).toEqual(turned);
    aim.pad({ t: time.now(), x: 0, y: 0, type: "down" });
    aim.centre(time.now());
    expect(aim.aim()).toEqual(turned);
    expect(sent).toEqual([]);
  });

  it("volleys that open send nothing for motion", () => {
    const { aim, motion, sent, time } = setup();
    aim.use(motion);
    aim.volleyOpened(time.now());
    expect(sent).toEqual([]);
  });
});

describe("createShotAim with touch", () => {
  it("uses the drag pad without a motion result, or with touch", () => {
    const { aim } = setup();
    expect(aim.mode()).toBe("touch");
    aim.use(undefined);
    expect(aim.mode()).toBe("touch");
    aim.use({ mode: "touch" });
    expect(aim.mode()).toBe("touch");
  });

  it("switches to touch when motion stops mid-game, and stops reading the sensors", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    aim.use({ mode: "touch" });
    expect(aim.mode()).toBe("touch");
    aim.startDraw(time.now());
    play(1000, 40);
    expect(aim.aim()).toEqual({ yaw: 0, pitch: 0 });
    expect(sent).toHaveLength(1);
  });

  it("sends the current aim when a volley opens, so the crosshair shows", () => {
    const { aim, sent, time } = setup();
    aim.volleyOpened(time.now());
    expect(sent).toEqual([{ type: "aim", payload: { aim: [[0, 0, 0]] } }]);
  });

  it("streams while the pad is dragged, then stops", () => {
    const { aim, sent, time } = setup();
    let t = time.now();
    aim.pad({ t, x: 100, y: 300, type: "down" });
    expect(sent).toHaveLength(1);
    for (let i = 1; i <= 30; i++) {
      time.advance(16);
      t = time.now();
      aim.pad({ t, x: 100 + i * 2, y: 300 - i, type: "move" });
    }
    aim.pad({ t, x: 160, y: 270, type: "up" });
    time.advance(500);
    // 60 px right is 0.6 of yaw, 30 px up is 0.4 of pitch.
    expect(aim.aim()).toEqual({ yaw: 0.6, pitch: 0.4 });
    const count = sent.length;
    expect(count).toBeGreaterThan(1);
    expect(sent.at(-1)).toMatchObject({ type: "aim" });

    aim.centre(time.now());
    time.advance(500);
    expect(aim.aim()).toEqual({ yaw: 0, pitch: 0 });
    expect(sent).toHaveLength(count);
  });

  it("doesn't recentre at the draw, so the shot carries the pad's aim", () => {
    const { aim, sent, time } = setup();
    aim.pad({ t: time.now(), x: 0, y: 0, type: "down" });
    aim.pad({ t: time.now() + 16, x: -50, y: 0, type: "move" });
    aim.pad({ t: time.now() + 32, x: -50, y: 0, type: "up" });
    time.advance(300);
    aim.startDraw(time.now());
    expect(aim.aim()).toEqual({ yaw: -0.5, pitch: 0 });
    time.advance(300);
    aim.shoot(2, 1, time.now());
    time.advance(300);
    expect(sent.at(-1)).toEqual({
      type: "shoot",
      payload: { volley: 2, aim: { yaw: -0.5, pitch: 0 }, power: 1 },
    });
  });
});
