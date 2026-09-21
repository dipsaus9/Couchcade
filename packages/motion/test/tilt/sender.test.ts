import { describe, expect, it } from "vitest";
import type { GameInput } from "@couchcade/game-sdk/contract";
import { createPoseTracker } from "@couchcade/motion/calibration";
import { createTiltJoystick, type JoystickVector } from "@couchcade/motion/fallbacks";
import { type TiltInput, createTiltDetector, createTiltSender } from "@couchcade/motion/gestures";
import { calibrated, CALIBRATION_MS, ease } from "./traces.ts";
import { tiltSamples } from "./traces.ts";

interface Sent {
  input: GameInput;
  eventTimeStamp: number;
}

/**
 * A fake `InputChannel`, narrowed to the one method `createTiltSender` uses: it just records what
 * `stream` was called with (AC#2: tilt goes through `input.stream`). The real pacing and packing
 * (direct link hz, relay `more`) live in `@couchcade/game-sdk/input`'s `createInputChannel`
 * (CC-3.18), covered by its own tests.
 */
function createRig() {
  const sent: Sent[] = [];
  const channel = {
    stream: (input: GameInput, eventTimeStamp?: number) => {
      sent.push({ input, eventTimeStamp: eventTimeStamp ?? Number.NaN });
    },
  };
  const sender = createTiltSender(channel);
  const tiltMessages = () => sent.filter((s) => s.input.type === "tilt");
  return { sent, channel, sender, tiltMessages };
}

describe("createTiltSender", () => {
  it("calls channel.stream once per changed sample, with the game's input type and the reading's time", () => {
    const rig = createRig();
    rig.sender.update({ t: 100, x: 0.2, y: -0.1 });
    expect(rig.sent).toEqual([
      { input: { type: "tilt", payload: { x: 0.2, y: -0.1 } }, eventTimeStamp: 100 },
    ]);
  });

  it("sends nothing while the tilt holds the same value", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, x: 0.3, y: 0.1 });
    expect(rig.sent).toHaveLength(1);
    rig.sender.update({ t: 16, x: 0.3, y: 0.1 });
    rig.sender.update({ t: 32, x: 0.3, y: 0.1 });
    expect(rig.sent).toHaveLength(1);

    rig.sender.update({ t: 48, x: 0.35, y: 0.1 });
    expect(rig.sent).toHaveLength(2);
    expect(rig.sent[1]?.input.payload).toEqual({ x: 0.35, y: 0.1 });
  });

  it("uses the game's input type", () => {
    const rig = createRig();
    const sender = createTiltSender<TiltInput & { type: "steer" }>(rig.channel, {
      type: "steer",
    });
    sender.update({ t: 0, x: 0.2, y: 0.1 });
    expect(rig.sent.at(-1)?.input).toEqual({ type: "steer", payload: { x: 0.2, y: 0.1 } });
  });

  it("reset forgets the last sample sent, so the next update always goes out", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, x: 0.5, y: 0 });
    rig.sender.reset();
    rig.sender.update({ t: 10, x: 0.5, y: 0 });
    expect(rig.sent).toHaveLength(2);
  });

  it("dispose ignores every later update", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, x: 0.5, y: 0 });
    rig.sender.dispose();
    rig.sender.update({ t: 10, x: -0.5, y: 0 });
    expect(rig.sent).toHaveLength(1);
  });

  it("streams a tilting phone end to end through input.stream (AC#2), not the batching helper", () => {
    const rig = createRig();
    const roll = ease(0, 20, CALIBRATION_MS + 100, CALIBRATION_MS + 1100);
    const trace = calibrated(tiltSamples({ durationMs: CALIBRATION_MS + 1600, roll }));
    const tracker = createPoseTracker(trace.calibration);
    const detector = createTiltDetector();
    detector.on((reading) => rig.sender.update(reading));

    for (const sample of trace.samples) detector.push(tracker.push(sample));

    expect(rig.tiltMessages().length).toBeGreaterThan(3);
    for (const { input } of rig.tiltMessages()) {
      const payload = input.payload as { x: number; y: number };
      expect(Math.round(payload.x / 0.05) * 0.05).toBeCloseTo(payload.x, 10);
      expect(Math.round(payload.y / 0.05) * 0.05).toBeCloseTo(payload.y, 10);
    }
    const lastPayload = rig.tiltMessages().at(-1)?.input.payload;
    expect(lastPayload).toEqual(detector.tilt());
  });

  it("emits the same values a joystick would, for the same shape of input", () => {
    const rig = createRig();
    const joystick = createTiltJoystick();
    joystick.on((reading) => rig.sender.update(reading));
    const vectors: JoystickVector[] = [
      { t: 0, x: 0, y: 0 },
      { t: 16, x: 0.5, y: -0.3 },
      { t: 32, x: 0.9, y: -0.6 },
    ];
    for (const vector of vectors) joystick.push(vector);

    expect(rig.tiltMessages().length).toBeGreaterThan(0);
    const last = rig.tiltMessages().at(-1);
    expect(last?.input.payload).toEqual(joystick.tilt());
  });
});
