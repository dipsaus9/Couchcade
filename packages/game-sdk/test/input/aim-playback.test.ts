import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encode, maxFrameBytes, utf8ByteLength } from "@couchcade/protocol";
import {
  addAimSamples,
  AIM_PLAYBACK_DELAY_MS,
  AIM_SAMPLES_PER_MESSAGE,
  AIM_SAMPLES_PER_SECOND,
  AIM_TRACK_MAX_POINTS,
  aimAt,
  createInputStream,
} from "@couchcade/game-sdk/input";
import type { AimSample, AimTrack } from "@couchcade/game-sdk/input";

const interval = 1000 / AIM_SAMPLES_PER_SECOND;

/** The input shape motion.md gives aim: packed `[dtMs, yaw, pitch]` samples, newest last. */
type AimInput = { type: "aim"; payload: { aim: Array<[number, number, number]> } };

/** A phone turning at a steady speed, so the true aim at any moment is known. */
const trueYaw = (t: number) => t / 10_000;

describe("addAimSamples", () => {
  it("places samples at the input's time plus their offset, oldest first", () => {
    const track = addAimSamples([], 1_000, [
      [-100, 0.1, 0.2],
      [-50, 0.3, 0.4],
      [0, 0.5, 0.6],
    ]);

    expect(track).toEqual([
      [900, 0.1, 0.2],
      [950, 0.3, 0.4],
      [1_000, 0.5, 0.6],
    ]);
  });

  it("returns a new track and leaves the old one alone", () => {
    const before: AimTrack = [[900, 0, 0]];
    const copy = structuredClone(before);

    const after = addAimSamples(before, 1_000, [[0, 1, 1]]);

    expect(before).toEqual(copy);
    expect(after).not.toBe(before);
    expect(JSON.parse(JSON.stringify(after))).toEqual(after);
  });

  it("merges an overlapping message: the newer sample replaces one at the same time", () => {
    const first = addAimSamples([], 1_000, [
      [-50, 0.1, 0],
      [0, 0.2, 0],
    ]);
    const second = addAimSamples(first, 1_050, [
      [-50, 0.25, 0],
      [0, 0.3, 0],
    ]);

    expect(second).toEqual([
      [950, 0.1, 0],
      [1_000, 0.25, 0],
      [1_050, 0.3, 0],
    ]);
  });

  it("clamps to −1 to 1, skips non-finite samples and uses only the newest 4 per message", () => {
    const samples: AimSample[] = [
      [-400, 0.9, 0.9],
      [-300, 2, -2],
      [-200, Number.NaN, 0],
      [-100, 0, Number.POSITIVE_INFINITY],
      [0, -0.5, 0.5],
    ];

    expect(AIM_SAMPLES_PER_MESSAGE).toBe(4);
    expect(addAimSamples([], 1_000, samples)).toEqual([
      [700, 1, -1],
      [1_000, -0.5, 0.5],
    ]);
    expect(addAimSamples([[5, 0, 0]], 1_000, [[Number.NaN, 0, 0]])).toEqual([[5, 0, 0]]);
  });

  it("keeps the newest points only", () => {
    let track: AimTrack = [];
    for (let i = 0; i < 40; i++) track = addAimSamples(track, i * 100, [[0, 0, 0]]);

    expect(track).toHaveLength(AIM_TRACK_MAX_POINTS);
    expect(track[0]![0]).toBe((40 - AIM_TRACK_MAX_POINTS) * 100);
    expect(addAimSamples(track, 5_000, [[0, 0, 0]], 3)).toHaveLength(3);
  });
});

describe("aimAt", () => {
  const track: AimTrack = [
    [1_000, 0, 0],
    [1_000 + interval, 0.3, -0.6],
    [1_000 + 2 * interval, 0.6, -0.3],
  ];

  it("has no aim before the first sample arrives", () => {
    expect(aimAt([], 5_000)).toBeNull();
  });

  it("plays the track 250 ms behind the game clock", () => {
    expect(AIM_PLAYBACK_DELAY_MS).toBe(250);
    expect(aimAt(track, 1_250 + interval)).toEqual({ yaw: 0.3, pitch: -0.6 });
    // At the moment the newest sample arrives, the TV still shows the first one.
    expect(aimAt(track, 1_000 + 2 * interval)).toEqual({ yaw: 0, pitch: 0 });
  });

  it("moves in a straight line between samples", () => {
    const mid = aimAt(track, 1_250 + interval / 2)!;
    expect(mid.yaw).toBeCloseTo(0.15, 10);
    expect(mid.pitch).toBeCloseTo(-0.3, 10);
  });

  it("holds the first sample before it and the last one after it", () => {
    expect(aimAt(track, 0)).toEqual({ yaw: 0, pitch: 0 });
    expect(aimAt(track, 60_000)).toEqual({ yaw: 0.6, pitch: -0.3 });
  });

  it("takes another delay", () => {
    expect(aimAt(track, 1_000 + interval, 0)).toEqual({ yaw: 0.3, pitch: -0.6 });
  });

  it("holds still across a gap and moves only in the interval before the next sample", () => {
    const still: AimTrack = [
      [1_000, 0.2, 0],
      [3_000, 0.8, 0],
    ];

    expect(aimAt(still, 2_000 + AIM_PLAYBACK_DELAY_MS)).toEqual({ yaw: 0.2, pitch: 0 });
    expect(aimAt(still, 3_000 - interval + AIM_PLAYBACK_DELAY_MS)).toEqual({ yaw: 0.2, pitch: 0 });
    expect(aimAt(still, 3_000 - interval / 2 + AIM_PLAYBACK_DELAY_MS)!.yaw).toBeCloseTo(0.5, 10);
  });
});

describe("aim from phone to TV", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("packs 15 Hz samples into at most 4 messages a second, each under 1 KB", () => {
    const frames: string[] = [];
    const sentAt: number[] = [];
    const stream = createInputStream((input: AimInput, eventTimeStamp?: number) => {
      sentAt.push(performance.now());
      frames.push(encode({ t: "input", d: { ...input, at: Math.round(eventTimeStamp ?? 0) } }));
    });

    const window: Array<[number, number, number]> = [];
    for (let i = 0; i < AIM_SAMPLES_PER_SECOND * 3; i++) {
      const t = performance.now();
      // Full-precision values: the worst case for the frame size.
      window.push([t, Math.sin(t) * 0.987_654_321_012_345, -Math.cos(t) * 0.123_456_789_012_345]);
      if (window.length > AIM_SAMPLES_PER_MESSAGE) window.shift();
      const aim = window.map(([at, yaw, pitch]): [number, number, number] => [at - t, yaw, pitch]);
      stream.set({ type: "aim", payload: { aim } }, t);
      vi.advanceTimersByTime(interval);
    }
    vi.advanceTimersByTime(1_000);

    expect(frames.length).toBeLessThanOrEqual(3 * 4 + 1);
    for (const frame of frames) expect(utf8ByteLength(frame)).toBeLessThan(maxFrameBytes);
    for (let i = 1; i < sentAt.length; i++) {
      expect(sentAt[i]! - sentAt[i - 1]!).toBeGreaterThanOrEqual(250 - 1e-6);
    }
  });

  it("replays the phone's aim on the TV 250 ms behind, within one sample", () => {
    let track: AimTrack = [];
    const stream = createInputStream((input: AimInput, eventTimeStamp?: number) => {
      // The host receives at once, with `at` (here in game time) stamped from the event time.
      track = addAimSamples(track, eventTimeStamp!, input.payload.aim);
    });

    const start = performance.now();
    const window: Array<[number, number]> = [];
    const sample = () => {
      const t = performance.now();
      window.push([t, trueYaw(t)]);
      if (window.length > AIM_SAMPLES_PER_MESSAGE) window.shift();
      const aim = window.map(([at, yaw]): [number, number, number] => [at - t, yaw, 0]);
      stream.set({ type: "aim", payload: { aim } }, t);
    };
    sample();
    setInterval(sample, interval);

    const shown: number[] = [];
    while (performance.now() - start < 4_000) {
      vi.advanceTimersByTime(5);
      const now = performance.now();
      const playhead = now - AIM_PLAYBACK_DELAY_MS;
      if (playhead < start) continue;
      const yaw = aimAt(track, now)!.yaw;
      shown.push(yaw);
      // Never ahead of the aim 250 ms ago, and never more than one sample behind it.
      expect(yaw).toBeLessThanOrEqual(trueYaw(playhead) + 1e-9);
      expect(yaw).toBeGreaterThanOrEqual(trueYaw(playhead - interval - 1) - 1e-9);
    }
    // The crosshair glides: it moves in steps far smaller than 4 jumps a second would make.
    const steps = shown.slice(1).map((yaw, i) => yaw - shown[i]!);
    expect(Math.max(...steps)).toBeLessThan(trueYaw(interval));
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(-1e-9);
  });
});
