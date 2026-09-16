import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { GameInput } from "@couchcade/game-sdk/contract";
import {
  addAimSamples,
  AIM_SAMPLES_PER_MESSAGE,
  AIM_SAMPLES_PER_SECOND,
  type AimSample,
  type AimTrack,
  aimAt,
  createInputStream,
  PHONE_INPUT_MIN_GAP_MS,
} from "@couchcade/game-sdk/input";
import { createAimDrag, type PointerPoint } from "@couchcade/motion/fallbacks";
import {
  AIM_SAMPLE_INTERVAL_MS,
  type AimInput,
  type AimReading,
  createAimDetector,
  createAimSender,
  type PackedAimSample,
  packAim,
} from "@couchcade/motion/gestures";
import { aimSamples, CALIBRATION_MS, calibrated, ease } from "./traces.ts";
import { createPoseTracker } from "@couchcade/motion/calibration";

interface Sent {
  /** Fake ms since the rig was made. */
  sentAt: number;
  input: GameInput;
  eventTimeStamp: number;
}

/**
 * The phone's input path on Vitest's fake timers: a CC-3.6 input stream around a send helper that
 * records what goes out, and an aim sender in front of it. Times are fake ms since the rig was made,
 * the same base as the readings.
 */
function createRig() {
  const start = performance.now();
  const now = () => performance.now() - start;
  const sent: Sent[] = [];
  const stream = createInputStream<GameInput>(
    (input, eventTimeStamp) => {
      sent.push({ sentAt: now(), input, eventTimeStamp: eventTimeStamp ?? Number.NaN });
      return Math.round(now());
    },
    { now },
  );
  // When the sender took each sample, on the fake clock.
  const sampledAt: number[] = [];
  const set = vi.fn<(input: AimInput, eventTimeStamp?: number) => void>((input, eventTimeStamp) => {
    sampledAt.push(now());
    stream.set(input, eventTimeStamp);
  });
  const sender = createAimSender({ set }, { now });
  /** Moves fake time forward to `t`, firing due timers. */
  const advanceTo = (t: number) => vi.advanceTimersByTime(Math.max(t - now(), 0));
  const aimMessages = () => sent.filter((s) => s.input.type === "aim");
  return { stream, sender, sent, set, sampledAt, now, advanceTo, aimMessages };
}

/** Plays readings on their own times. */
function play(rig: ReturnType<typeof createRig>, readings: AimReading[]) {
  for (const reading of readings) {
    rig.advanceTo(reading.t);
    rig.sender.update(reading);
  }
}

/** The samples a message carries, with `dtMs` turned back into the phone's time. */
const samplesOf = ({ input, eventTimeStamp }: Sent) =>
  (input as AimInput).payload.aim.map(([dtMs, yaw, pitch]) => [eventTimeStamp + dtMs, yaw, pitch]);

/** The time between each pair of neighbouring times. */
const gaps = (times: number[]) => times.slice(1).map((t, index) => t - (times[index] ?? t));

/** The aim samples of a sent message. */
function aimOf(message: Sent | undefined): PackedAimSample[] {
  if (!message) throw new Error("no message");
  return (message.input as AimInput).payload.aim;
}

/** A reading every 1/60 s that changes every time: a player sweeping the aim. */
const sweep = (fromMs: number, toMs: number): AimReading[] =>
  Array.from({ length: Math.floor(((toMs - fromMs) * 60) / 1000) + 1 }, (_, i) => {
    const t = Math.round(fromMs + (i * 1000) / 60);
    return { t, yaw: Math.round(Math.sin(t / 300) * 100) / 100, pitch: (i % 50) / 100 };
  });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("packAim", () => {
  it("packs the newest 4 readings, newest last, as [dtMs, yaw, pitch] from the newest", () => {
    const readings = [0, 66.7, 133.3, 200, 266.7].map((t, i) => ({
      t: 1000 + t,
      yaw: i / 10,
      pitch: -i / 10,
    }));
    expect(packAim(readings)).toEqual([
      [-200, 0.1, -0.1],
      [-133, 0.2, -0.2],
      [-67, 0.3, -0.3],
      [0, 0.4, -0.4],
    ]);
    expect(packAim([])).toEqual([]);
  });

  it("matches the host's aim sample format in @couchcade/game-sdk/input", () => {
    expectTypeOf<PackedAimSample>().toExtend<AimSample>();
    expectTypeOf<AimInput>().toExtend<GameInput>();
    expect(AIM_SAMPLE_INTERVAL_MS).toBe(1000 / AIM_SAMPLES_PER_SECOND);

    const packed = packAim([
      { t: 500, yaw: 0.1, pitch: 0 },
      { t: 567, yaw: 0.2, pitch: 0.05 },
    ]);
    const track = addAimSamples([], 10_567, packed);
    expect(track).toEqual([
      [10_500, 0.1, 0],
      [10_567, 0.2, 0.05],
    ]);
  });
});

describe("createAimSender", () => {
  it("samples at most 15 times a second and sends at most 4 messages a second", () => {
    const rig = createRig();
    play(rig, sweep(0, 3000));
    rig.advanceTo(4000);

    const sampleTimes = rig.sampledAt;
    expect(sampleTimes.length).toBeGreaterThanOrEqual(3 * AIM_SAMPLES_PER_SECOND - 1);
    for (let second = 0; second < 4; second++) {
      const inSecond = (t: number) => t >= second * 1000 && t < (second + 1) * 1000;
      expect(sampleTimes.filter(inSecond).length).toBeLessThanOrEqual(AIM_SAMPLES_PER_SECOND);
      expect(rig.aimMessages().filter((s) => inSecond(s.sentAt)).length).toBeLessThanOrEqual(4);
    }
    expect(Math.min(...gaps(sampleTimes))).toBeGreaterThanOrEqual(AIM_SAMPLE_INTERVAL_MS);
    const sendTimes = rig.aimMessages().map((s) => s.sentAt);
    expect(Math.min(...gaps(sendTimes))).toBeGreaterThanOrEqual(PHONE_INPUT_MIN_GAP_MS);
    expect(sendTimes.length).toBeGreaterThanOrEqual(11);
  });

  it("packs up to 4 samples per message, newest last with dtMs 0, and every sample reaches the host", () => {
    const rig = createRig();
    play(rig, sweep(0, 2000));
    rig.advanceTo(3000);

    const sampled = rig.set.mock.calls.map(([input, t]) => {
      const newest = (input as AimInput).payload.aim.at(-1);
      return [t, newest?.[1], newest?.[2]];
    });
    let track: AimTrack = [];
    for (const message of rig.aimMessages()) {
      const { aim } = (message.input as AimInput).payload;
      expect(aim.length).toBeGreaterThanOrEqual(1);
      expect(aim.length).toBeLessThanOrEqual(AIM_SAMPLES_PER_MESSAGE);
      expect(aim.at(-1)?.[0]).toBe(0);
      const offsets = aim.map(([dtMs]) => dtMs);
      expect(offsets).toEqual(offsets.toSorted((a, b) => a - b));
      for (const [dtMs] of aim) expect(Number.isInteger(dtMs)).toBe(true);
      // The largest input, 4 samples, stays far inside the 1 KB frame cap (motion.md: under 150 bytes).
      expect(JSON.stringify(message.input).length).toBeLessThan(150);
      track = addAimSamples(track, message.eventTimeStamp, aim, 1000);
    }
    const received = rig.aimMessages().flatMap(samplesOf);
    for (const [t, yaw, pitch] of sampled) {
      expect(received).toContainEqual([t, yaw, pitch]);
    }
    expect(track.length).toBe(sampled.length);
  });

  it("sends nothing while the aim holds still, and skips steps under 0.01", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, yaw: 0.3, pitch: 0.1 });
    for (let i = 1; i < 60; i++) {
      rig.advanceTo((i * 1000) / 60);
      rig.sender.update({ t: rig.now(), yaw: 0.3 + (i % 2) * 0.004, pitch: 0.1 });
    }
    rig.advanceTo(2000);
    expect(rig.set).toHaveBeenCalledTimes(1);
    expect(rig.aimMessages()).toHaveLength(1);

    rig.sender.update({ t: rig.now(), yaw: 0.31, pitch: 0.1 });
    rig.advanceTo(3000);
    expect(rig.aimMessages()).toHaveLength(2);
    expect(aimOf(rig.aimMessages()[1])).toEqual([
      [-2000, 0.3, 0.1],
      [0, 0.31, 0.1],
    ]);
  });

  it("still samples the final aim when a drag stops between two samples", () => {
    const rig = createRig();
    const aim = createAimDrag();
    aim.on((reading) => rig.sender.update(reading));
    const points: PointerPoint[] = [
      { t: 0, x: 0, y: 0, type: "down" },
      { t: 10, x: 10, y: 0, type: "move" },
      { t: 20, x: 30, y: 0, type: "move" },
      { t: 30, x: 60, y: 0, type: "up" },
    ];
    for (const point of points) {
      rig.advanceTo(point.t);
      aim.push(point);
    }
    rig.advanceTo(1000);
    expect(rig.set).toHaveBeenCalledTimes(2);
    expect(rig.set.mock.calls.map(([, t]) => t)).toEqual([10, 30]);
    const last = rig.aimMessages().at(-1);
    expect(aimOf(last)).toEqual([
      [-20, 0.1, 0],
      [0, 0.6, 0],
    ]);
    expect(last?.sentAt).toBe(10 + PHONE_INPUT_MIN_GAP_MS);
  });

  it("reset drops a waiting sample and starts a fresh window; dispose stops it", () => {
    const rig = createRig();
    rig.sender.update({ t: 0, yaw: 0.5, pitch: 0 });
    rig.advanceTo(10);
    rig.sender.update({ t: 10, yaw: 0.6, pitch: 0 });
    rig.sender.reset();
    rig.advanceTo(100);
    expect(rig.set).toHaveBeenCalledTimes(1);

    rig.sender.update({ t: 100, yaw: 0.5, pitch: 0 });
    expect(rig.set).toHaveBeenLastCalledWith({ type: "aim", payload: { aim: [[0, 0.5, 0]] } }, 100);

    rig.sender.dispose();
    rig.advanceTo(300);
    rig.sender.update({ t: 300, yaw: -1, pitch: 0 });
    rig.advanceTo(1000);
    expect(rig.set).toHaveBeenCalledTimes(2);
  });

  it("uses the game's input type", () => {
    const rig = createRig();
    const sender = createAimSender(rig.stream, { type: "bow", now: rig.now });
    sender.update({ t: 0, yaw: 0.2, pitch: 0.1 });
    expect(rig.sent.at(-1)?.input).toEqual({ type: "bow", payload: { aim: [[0, 0.2, 0.1]] } });
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
      rig.advanceTo(sample.t);
      detector.push(tracker.push(sample));
      if (shot === null && sample.t >= CALIBRATION_MS + 700) {
        shot = { at: sample.t, aim: detector.aim() };
        rig.stream.fire({ type: "shot", payload: { aim: shot.aim } }, sample.t);
      }
    }
    rig.advanceTo(CALIBRATION_MS + 3000);
    if (shot === null) throw new Error("no shot");

    // The shot's payload is the phone's own aim when it fired, halfway through the turn.
    const fired = rig.sent.find((s) => s.input.type === "shot");
    expect(fired?.input.payload).toEqual({ aim: shot.aim });
    expect(shot.aim.yaw).toBeGreaterThan(0.3);
    expect(shot.aim.yaw).toBeLessThan(0.6);

    // The TV's crosshair plays the stream 250 ms behind, so at the shot it still trails the hand.
    let track: AimTrack = [];
    for (const message of rig.aimMessages().filter((s) => s.sentAt <= shot.at)) {
      track = addAimSamples(track, message.eventTimeStamp, (message.input as AimInput).payload.aim);
    }
    expect(aimAt(track, shot.at)?.yaw ?? 0).toBeLessThan(shot.aim.yaw);

    // Once the phone is still, the last message ends at the final aim.
    const last = rig.aimMessages().at(-1);
    expect(aimOf(last).at(-1)?.slice(1)).toEqual([0.8, 0]);
    const aimMessages = rig.aimMessages();
    const first = trace.samples[0];
    if (!first) throw new Error("no samples");
    const seconds = (CALIBRATION_MS + 1600 - first.t) / 1000;
    expect(aimMessages.length).toBeLessThanOrEqual(Math.ceil(seconds * 4));
  });
});
