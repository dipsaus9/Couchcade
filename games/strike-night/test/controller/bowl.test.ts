import { createFakeAdapter } from "@couchcade/motion/sensors";
import { describe, expect, it } from "vitest";
import { createBowl, type StrikeNightMotion } from "../../src/controller/bowl.ts";
import { inputSchema, type StrikeNightInput } from "../../src/shared/input.ts";
import { createTestChannel } from "./channel.ts";
import { flatCalibration, turn } from "./motion.ts";

const calibration = flatCalibration();
const types = (sent: StrikeNightInput[]) => sent.map((input) => input.type);

function setup() {
  const { channel, sent } = createTestChannel();
  const bowl = createBowl(channel);
  const adapter = createFakeAdapter();
  const motion: StrikeNightMotion = { mode: "motion", adapter, calibration };
  return { sent, bowl, adapter, motion };
}

describe("createBowl with motion", () => {
  it("starts in touch mode and switches once a motion result arrives", () => {
    const { bowl, motion } = setup();
    expect(bowl.mode()).toBe("touch");
    bowl.use(motion);
    expect(bowl.mode()).toBe("motion");
  });

  it("streams grip on gripDown and gripUp without a swing", () => {
    const { bowl, sent, motion } = setup();
    bowl.use(motion);
    bowl.gripDown(1, 0.2, { t: 0, x: 0, y: 0, type: "down" });
    expect(sent).toEqual([{ type: "grip", payload: { turn: 1, held: true } }]);
    const bowled = bowl.gripUp({ t: 100, x: 0, y: 0, type: "up" });
    expect(bowled).toBe(false);
    expect(sent).toEqual([
      { type: "grip", payload: { turn: 1, held: true } },
      { type: "grip", payload: { turn: 1, held: false } },
    ]);
  });

  it("bowls once a firm enough swing releases, with the stand position and no held-false", () => {
    const { bowl, sent, motion, adapter } = setup();
    bowl.use(motion);
    bowl.gripDown(4, 0.35, { t: 1000, x: 0, y: 0, type: "down" });
    // The peak ties at the first sample (every sample here has the same magnitude), so the
    // release must land within the detector's 300 ms release window of t = 1016.
    for (const sample of turn(1016, 48, 600)) adapter.push(sample);
    const bowled = bowl.gripUp({ t: 1100, x: 0, y: 0, type: "up" });
    expect(bowled).toBe(true);
    const grips = sent.filter((input) => input.type === "grip");
    expect(grips).toEqual([{ type: "grip", payload: { turn: 4, held: true } }]);
    const bowls = sent.filter((input) => input.type === "bowl");
    expect(bowls).toHaveLength(1);
    expect(bowls[0]).toMatchObject({ type: "bowl", payload: { turn: 4, x: 0.35 } });
    const payload = (bowls[0] as Extract<StrikeNightInput, { type: "bowl" }>).payload;
    expect(payload.speed).toBeGreaterThan(0);
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("a cancelled grip streams grip false and never bowls", () => {
    const { bowl, sent, motion, adapter } = setup();
    bowl.use(motion);
    bowl.gripDown(2, 0, { t: 0, x: 0, y: 0, type: "down" });
    for (const sample of turn(16, 300, 900)) adapter.push(sample);
    bowl.gripCancel(2, 400);
    expect(types(sent)).toEqual(["grip", "grip"]);
    expect(sent.at(-1)).toEqual({ type: "grip", payload: { turn: 2, held: false } });
  });

  it("reset forgets a swing in progress, so the next release doesn't bowl it", () => {
    const { bowl, sent, motion, adapter } = setup();
    bowl.use(motion);
    bowl.gripDown(1, 0, { t: 0, x: 0, y: 0, type: "down" });
    for (const sample of turn(16, 200, 900)) adapter.push(sample);
    bowl.reset();
    const bowled = bowl.gripUp({ t: 300, x: 0, y: 0, type: "up" });
    expect(bowled).toBe(false);
    expect(sent.filter((input) => input.type === "bowl")).toEqual([]);
  });

  it("stops reading the sensors once disposed", () => {
    const { bowl, sent, motion, adapter } = setup();
    bowl.use(motion);
    bowl.gripDown(1, 0, { t: 0, x: 0, y: 0, type: "down" });
    bowl.dispose();
    for (const sample of turn(16, 300, 900)) adapter.push(sample);
    bowl.gripUp({ t: 400, x: 0, y: 0, type: "up" });
    expect(sent.filter((input) => input.type === "bowl")).toEqual([]);
  });
});

describe("createBowl with touch", () => {
  it("uses the swipe pad without a motion result, or with touch", () => {
    const { bowl } = setup();
    expect(bowl.mode()).toBe("touch");
    bowl.use(undefined);
    expect(bowl.mode()).toBe("touch");
    bowl.use({ mode: "touch" });
    expect(bowl.mode()).toBe("touch");
  });

  it("bowls on a swipe up past the minimum distance", () => {
    const { bowl, sent } = setup();
    bowl.gripDown(3, -0.4, { t: 0, x: 100, y: 400, type: "down" });
    bowl.gripMove({ t: 50, x: 100, y: 250, type: "move" });
    const bowled = bowl.gripUp({ t: 80, x: 100, y: 320, type: "up" });
    expect(bowled).toBe(true);
    const bowls = sent.filter((input) => input.type === "bowl");
    expect(bowls).toHaveLength(1);
    expect(bowls[0]).toMatchObject({ type: "bowl", payload: { turn: 3, x: -0.4 } });
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("a swipe too short releases the grip without bowling", () => {
    const { bowl, sent } = setup();
    bowl.gripDown(1, 0, { t: 0, x: 100, y: 400, type: "down" });
    const bowled = bowl.gripUp({ t: 40, x: 100, y: 390, type: "up" });
    expect(bowled).toBe(false);
    expect(sent.filter((input) => input.type === "bowl")).toEqual([]);
    expect(sent.at(-1)).toEqual({ type: "grip", payload: { turn: 1, held: false } });
  });

  it("switches to touch when motion stops mid-game, and stops reading the sensors", () => {
    const { bowl, sent, motion, adapter } = setup();
    bowl.use(motion);
    bowl.use({ mode: "touch" });
    expect(bowl.mode()).toBe("touch");
    bowl.gripDown(1, 0, { t: 0, x: 0, y: 0, type: "down" });
    for (const sample of turn(16, 300, 900)) adapter.push(sample);
    bowl.gripUp({ t: 400, x: 0, y: 0, type: "up" });
    // The abandoned motion adapter never produced a bowl; the swipe (with no move) is too short.
    expect(sent.filter((input) => input.type === "bowl")).toEqual([]);
  });
});
