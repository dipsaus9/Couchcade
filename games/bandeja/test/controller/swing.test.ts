import { createFakeAdapter } from "@couchcade/motion/sensors";
import { describe, expect, it } from "vitest";
import { createSwingController, type BandejaMotion } from "../../src/controller/swing.ts";
import { inputSchema, type BandejaInput } from "../../src/shared/input.ts";
import { createTestChannel } from "./channel.ts";
import { flatCalibration, swingBurst, turn } from "./motion.ts";

const calibration = flatCalibration();
const pad = () => ({ left: 0, width: 200 });

function setup() {
  const { channel, sent, timestamps } = createTestChannel();
  const swing = createSwingController(channel, pad);
  const adapter = createFakeAdapter();
  const motion: BandejaMotion = { mode: "motion", adapter, calibration };
  return { sent, timestamps, swing, adapter, motion };
}

const swings = (sent: BandejaInput[]) => sent.filter((input) => input.type === "swing");

describe("createSwingController with motion", () => {
  it("starts in touch mode and switches once a motion result arrives", () => {
    const { swing, motion } = setup();
    expect(swing.mode()).toBe("touch");
    swing.use(motion);
    expect(swing.mode()).toBe("motion");
  });

  it("fires a swing for the point newPoint last opened, with speed and angle from the swing", () => {
    const { swing, sent, motion, adapter } = setup();
    swing.use(motion);
    swing.newPoint(4, 0);
    for (const sample of swingBurst(16, 300, 900)) adapter.push(sample);
    const fired = swings(sent);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ type: "swing", payload: { point: 4 } });
    const payload = (fired[0] as Extract<BandejaInput, { type: "swing" }>).payload;
    expect(payload.speed).toBeGreaterThan(0);
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("a swing under the 320 deg/s minPeak (raised from the 240 default) never fires", () => {
    const { swing, sent, motion, adapter } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    // 280 deg/s: above the package default of 240, below Bandeja's own 320.
    for (const sample of swingBurst(16, 300, 280)) adapter.push(sample);
    expect(swings(sent)).toEqual([]);
  });

  it("newPoint re-references the heading for a new point without sending anything itself", () => {
    const { swing, sent, motion } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    swing.newPoint(2, 500);
    expect(sent).toEqual([]);
  });

  it("subsequent swings use the point from the latest newPoint", () => {
    const { swing, sent, motion, adapter } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    swing.newPoint(2, 0);
    for (const sample of swingBurst(16, 300, 900)) adapter.push(sample);
    expect(swings(sent)).toHaveLength(1);
    expect(swings(sent)[0]).toMatchObject({ payload: { point: 2 } });
  });

  it("stops reading the sensors once disposed", () => {
    const { swing, sent, motion, adapter } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    swing.dispose();
    for (const sample of swingBurst(16, 300, 900)) adapter.push(sample);
    expect(swings(sent)).toEqual([]);
  });

  it("notifies its own listeners every time a swing sends", () => {
    const { swing, motion, adapter } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    let count = 0;
    swing.on(() => count++);
    for (const sample of swingBurst(16, 300, 900)) adapter.push(sample);
    expect(count).toBe(1);
  });

  it("a listener can unsubscribe", () => {
    const { swing, motion, adapter } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    let count = 0;
    const stop = swing.on(() => count++);
    stop();
    for (const sample of swingBurst(16, 300, 900)) adapter.push(sample);
    expect(count).toBe(0);
  });
});

describe("createSwingController with touch", () => {
  it("uses the tap pad without a motion result, or with touch", () => {
    const { swing } = setup();
    expect(swing.mode()).toBe("touch");
    swing.use(undefined);
    expect(swing.mode()).toBe("touch");
    swing.use({ mode: "touch" });
    expect(swing.mode()).toBe("touch");
  });

  it("taps the left half of the pad for -60 and the right half for 60", () => {
    const { swing, sent } = setup();
    swing.newPoint(3, 0);
    swing.tap({ t: 0, x: 40, y: 0, type: "down" }); // pad is 0..200, left half
    swing.tap({ t: 1000, x: 160, y: 0, type: "down" }); // right half
    const fired = swings(sent);
    expect(fired).toHaveLength(2);
    expect(fired[0]).toMatchObject({
      type: "swing",
      payload: { point: 3, speed: 0.7, angle: -60 },
    });
    expect(fired[1]).toMatchObject({ type: "swing", payload: { point: 3, speed: 0.7, angle: 60 } });
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("a second tap inside the 400 ms cooldown is ignored", () => {
    const { swing, sent } = setup();
    swing.newPoint(1, 0);
    swing.tap({ t: 0, x: 40, y: 0, type: "down" });
    swing.tap({ t: 100, x: 160, y: 0, type: "down" });
    expect(swings(sent)).toHaveLength(1);
  });

  it("ignores a tap while in motion mode", () => {
    const { swing, sent, motion } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    swing.tap({ t: 0, x: 40, y: 0, type: "down" });
    expect(swings(sent)).toEqual([]);
  });

  it("switches to touch when motion stops mid-match, and stops reading the sensors", () => {
    const { swing, sent, motion, adapter } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    swing.use({ mode: "touch" });
    expect(swing.mode()).toBe("touch");
    for (const sample of turn(16, 300, 900)) adapter.push(sample);
    expect(swings(sent)).toEqual([]);
    swing.tap({ t: 2000, x: 40, y: 0, type: "down" });
    expect(swings(sent)).toHaveLength(1);
  });
});

describe("endMatch", () => {
  it("closes an open grip without sending anything", () => {
    const { swing, sent, motion } = setup();
    swing.use(motion);
    swing.newPoint(1, 0);
    swing.endMatch(500);
    expect(sent).toEqual([]);
  });

  it("is safe to call with nothing gripped", () => {
    const { swing, sent } = setup();
    expect(() => swing.endMatch(0)).not.toThrow();
    expect(sent).toEqual([]);
  });
});
