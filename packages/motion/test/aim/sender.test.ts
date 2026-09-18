import { describe, expect, it } from "vitest";
import type { GameInput } from "@couchcade/game-sdk/contract";
import { createPoseTracker } from "@couchcade/motion/calibration";
import { createAimDrag, type PointerPoint } from "@couchcade/motion/fallbacks";
import {
  AIM_MIN_STEP,
  type AimInput,
  createAimDetector,
  createAimSender,
} from "@couchcade/motion/gestures";
import { aimSamples, CALIBRATION_MS, calibrated, ease } from "./traces.ts";

interface Sent {
  input: GameInput;
  eventTimeStamp: number;
}

/**
 * A fake `InputChannel`, narrowed to the one method `createAimSender` uses: it just records what
 * `stream` was called with. The real pacing and packing (direct link hz, relay `more`) live in
 * `@couchcade/game-sdk/input`'s `createInputChannel` (CC-3.18), covered by its own tests.
 */
function createRig() {
  const sent: Sent[] = [];
  const channel = {
    stream: (input: GameInput, eventTimeStamp?: number) => {
      sent.push({ input, eventTimeStamp: eventTimeStamp ?? Number.NaN });
    },
  };
  const sender = createAimSender(channel);
  const aimMessages = () => sent.filter((s) => s.input.type === "aim");
  return { sent, channel, sender, aimMessages };
}

describe("createAimSender", () => {
  it("calls channel.stream once per kept sample, with the game's input type and the reading's time", () => {
    const rig = createRig();
    rig.sender.update({ t: 100, yaw: 0.2, pitch: 0.1 });
    expect(rig.sent).toEqual([
      { input: { type: "aim", payload: { yaw: 0.2, pitch: 0.1 } }, eventTimeStamp: 100 },
    ]);
  });

  it("rounds yaw and pitch to 3 decimals", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, yaw: 0.123456, pitch: -0.987654 });
    expect(rig.sent[0]?.input.payload).toEqual({ yaw: 0.123, pitch: -0.988 });
  });

  it("sends nothing while the aim holds still, skipping a step under AIM_MIN_STEP", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, yaw: 0.3, pitch: 0.1 });
    expect(rig.sent).toHaveLength(1);

    // Jitter smaller than the minimum step on both axes: no further sends.
    for (let i = 1; i < 20; i++) {
      const wobble = ((i % 2) * AIM_MIN_STEP) / 4;
      rig.sender.update({ t: i * 16, yaw: 0.3 + wobble, pitch: 0.1 - wobble });
    }
    expect(rig.sent).toHaveLength(1);

    // A real step, at least AIM_MIN_STEP on one axis, goes out.
    rig.sender.update({ t: 500, yaw: 0.3 + AIM_MIN_STEP, pitch: 0.1 });
    expect(rig.sent).toHaveLength(2);
    expect(rig.sent[1]?.input.payload).toEqual({ yaw: 0.301, pitch: 0.1 });
  });

  it("sends again once either axis alone crosses the minimum step", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, yaw: 0, pitch: 0 });
    rig.sender.update({ t: 16, yaw: 0, pitch: AIM_MIN_STEP });
    expect(rig.sent).toHaveLength(2);
  });

  it("uses the game's input type", () => {
    const rig = createRig();
    const sender = createAimSender<AimInput & { type: "bow" }>(rig.channel, { type: "bow" });
    sender.update({ t: 0, yaw: 0.2, pitch: 0.1 });
    expect(rig.sent.at(-1)?.input).toEqual({ type: "bow", payload: { yaw: 0.2, pitch: 0.1 } });
  });

  it("reset forgets the last sample sent, so the next update always goes out", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, yaw: 0.5, pitch: 0 });
    rig.sender.reset();
    rig.sender.update({ t: 10, yaw: 0.5, pitch: 0 });
    expect(rig.sent).toHaveLength(2);
  });

  it("dispose ignores every later update", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, yaw: 0.5, pitch: 0 });
    rig.sender.dispose();
    rig.sender.update({ t: 10, yaw: -0.5, pitch: 0 });
    expect(rig.sent).toHaveLength(1);
  });

  it("streams a turning phone end to end while a shot carries the aim at the moment of firing", () => {
    const rig = createRig();
    const heading = ease(0, 20, CALIBRATION_MS + 100, CALIBRATION_MS + 1100);
    const trace = calibrated(aimSamples({ durationMs: CALIBRATION_MS + 1600, heading }));
    const tracker = createPoseTracker(trace.calibration);
    const detector = createAimDetector();
    detector.on((reading) => rig.sender.update(reading));

    let shot: { at: number; aim: { yaw: number; pitch: number } } | null = null;
    for (const sample of trace.samples) {
      detector.push(tracker.push(sample));
      if (shot === null && sample.t >= CALIBRATION_MS + 700) {
        shot = { at: sample.t, aim: detector.aim() };
      }
    }
    if (shot === null) throw new Error("no shot");

    expect(shot.aim.yaw).toBeGreaterThan(0.3);
    expect(shot.aim.yaw).toBeLessThan(0.6);

    // Every detector emission that changed the aim produced exactly one channel.stream call, with
    // that same rounded value -- no packing or batching along the way.
    expect(rig.aimMessages().length).toBeGreaterThan(10);
    for (const { input } of rig.aimMessages()) {
      const payload = input.payload as { yaw: number; pitch: number };
      expect(Math.round(payload.yaw * 1000) / 1000).toBe(payload.yaw);
      expect(Math.round(payload.pitch * 1000) / 1000).toBe(payload.pitch);
    }
    // Once the phone is still, the last message carries the final aim.
    const lastPayload = rig.aimMessages().at(-1)?.input.payload as { yaw: number; pitch: number };
    const final = detector.aim();
    expect(lastPayload).toEqual(final);
  });

  it("emits the same values a drag pad would, for the same shape of input", () => {
    const rig = createRig();
    const drag = createAimDrag();
    drag.on((reading) => rig.sender.update(reading));
    const points: PointerPoint[] = [
      { t: 0, x: 0, y: 0, type: "down" },
      { t: 10, x: 10, y: 0, type: "move" },
      { t: 20, x: 30, y: 0, type: "move" },
      { t: 30, x: 60, y: 0, type: "up" },
    ];
    for (const point of points) drag.push(point);

    expect(rig.aimMessages().length).toBeGreaterThan(0);
    const last = rig.aimMessages().at(-1);
    expect(last?.input.payload).toEqual(drag.aim());
  });
});
