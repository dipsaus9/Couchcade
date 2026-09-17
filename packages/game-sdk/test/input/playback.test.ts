import { describe, expect, it } from "vitest";
import { createFakeLink } from "@couchcade/game-sdk/testing";
import { addSample, createPlayback } from "@couchcade/game-sdk/input";
import type { SampleTrack } from "@couchcade/game-sdk/input";
import { createVirtualTime } from "../clock/virtual-time.ts";

/** A raised-cosine "bump": 0 at t=0, `amplitude` at the midpoint, back to 0 (and at rest) at `stopMs`. */
function hump(amplitude: number, stopMs: number, t: number): number {
  const p = Math.min(Math.max(t, 0), stopMs) / stopMs;
  return (amplitude * (1 - Math.cos(2 * Math.PI * p))) / 2;
}

/** A deterministic PRNG (mulberry32), so the loss and jitter draws never flake in CI. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe("addSample", () => {
  it("appends a sample in time order", () => {
    let track = addSample([], 1_000, [0.1, 0.2]);
    track = addSample(track, 900, [0, 0]);
    track = addSample(track, 1_100, [0.2, 0.3]);

    expect(track).toEqual([
      [900, 0, 0],
      [1_000, 0.1, 0.2],
      [1_100, 0.2, 0.3],
    ]);
  });

  it("returns a new track and leaves the old one alone", () => {
    const before: SampleTrack<[number]> = [[900, 0]];
    const copy = structuredClone(before);

    const after = addSample(before, 1_000, [1]);

    expect(before).toEqual(copy);
    expect(after).not.toBe(before);
    expect(JSON.parse(JSON.stringify(after))).toEqual(after);
  });

  it("replaces a sample already at that time", () => {
    const track = addSample([[1_000, 0.1, 0.2]], 1_000, [0.5, 0.6]);
    expect(track).toEqual([[1_000, 0.5, 0.6]]);
  });

  it("ignores non-finite times or values", () => {
    const track = addSample([[5, 0, 0]], 1_000, [Number.NaN, 0]);
    expect(track).toEqual([[5, 0, 0]]);
    expect(addSample([[5, 0, 0]], Number.POSITIVE_INFINITY, [1, 1])).toEqual([[5, 0, 0]]);
  });

  it("keeps only the newest maxPoints", () => {
    let track: SampleTrack<[number]> = [];
    for (let i = 0; i < 70; i++) track = addSample(track, i * 10, [i]);

    expect(track).toHaveLength(64);
    expect(track[0]).toEqual([60, 6]);
    expect(addSample(track, 1_000, [99], 3)).toHaveLength(3);
  });
});

describe("createPlayback: interpolation and holding", () => {
  const interval = 100;
  const track: SampleTrack<[number, number]> = [
    [1_000, 0, 0],
    [1_000 + interval, 0.3, -0.6],
    [1_000 + 2 * interval, 0.6, -0.3],
  ];

  it("has nothing to draw before the first sample arrives", () => {
    expect(createPlayback<[number, number]>().at([], 5_000, 0, 16)).toBeNull();
  });

  it("holds the first sample before the delayed playhead reaches it", () => {
    const playback = createPlayback<[number, number]>({ predictMs: 0 });
    expect(playback.at(track, 900, 0, 16)).toEqual([0, 0]);
  });

  it("moves in a straight line between two samples", () => {
    const playback = createPlayback<[number, number]>({ predictMs: 0 });
    const mid = playback.at(track, 1_050, 0, 16)!;
    expect(mid[0]).toBeCloseTo(0.15, 10);
    expect(mid[1]).toBeCloseTo(-0.3, 10);
  });

  it("holds across a gap until one interval before the next sample, given the stream's interval", () => {
    const gappy: SampleTrack<[number]> = [
      [1_000, 0.2],
      [3_000, 0.8],
    ];
    const withInterval = () => createPlayback<[number]>({ predictMs: 0, intervalMs: interval });

    expect(withInterval().at(gappy, 2_000, 0, 16)).toEqual([0.2]);
    expect(withInterval().at(gappy, 3_000 - interval, 0, 16)).toEqual([0.2]);
    expect(withInterval().at(gappy, 3_000 - interval / 2, 0, 16)![0]).toBeCloseTo(0.5, 10);
  });
});

describe("createPlayback: prediction past the newest sample", () => {
  it("continues with the last velocity, eased out, clamped to -1..1", () => {
    const track: SampleTrack<[number]> = [
      [0, 0],
      [50, 0.1],
      [100, 0.2],
    ];
    // Velocity from the last 3 samples: (0.2 - 0) / 100 = 0.002 units/ms.
    const playback = createPlayback<[number]>({ predictMs: 100, tauMs: 60 });
    const at50PastEnd = playback.at(track, 150, 0, 16)![0];
    const decay = 1 - Math.exp(-50 / 60);
    expect(at50PastEnd).toBeCloseTo(0.2 + 0.002 * 60 * decay, 10);
  });

  it("stops advancing past the prediction horizon and holds there", () => {
    const track: SampleTrack<[number]> = [
      [0, 0],
      [50, 0.1],
      [100, 0.2],
    ];
    const playback = createPlayback<[number]>({ predictMs: 40, tauMs: 60, catchUpMs: 1e9 });
    const atHorizon = playback.at(track, 140, 0, 16)![0];
    const wellPast = createPlayback<[number]>({ predictMs: 40, tauMs: 60 }).at(
      track,
      500,
      0,
      16,
    )![0];
    const decay = 1 - Math.exp(-40 / 60);
    expect(atHorizon).toBeCloseTo(0.2 + 0.002 * 60 * decay, 10);
    expect(wellPast).toBeCloseTo(0.2 + 0.002 * 60 * decay, 10);
  });

  it("clamps a fast-moving prediction to -1 and 1", () => {
    const track: SampleTrack<[number]> = [
      [0, 0.9],
      [10, 0.95],
      [20, 0.99],
    ];
    const playback = createPlayback<[number]>({ predictMs: 100, tauMs: 60 });
    const value = playback.at(track, 120, 0, 16)![0];
    expect(value).toBe(1);
  });
});

describe("createPlayback: catching up without a jump", () => {
  it("jumps straight to the first target, then eases toward a corrected one", () => {
    const playback = createPlayback<[number]>({ catchUpMs: 50 });
    const first = playback.at([[0, 0.5]], 0, 0, 16)![0];
    expect(first).toBe(0.5); // no lag on the very first frame

    const second = playback.at([[0, 1]], 16, 0, 16)![0];
    const decay = 1 - Math.exp(-16 / 50);
    expect(second).toBeCloseTo(0.5 + (1 - 0.5) * decay, 10);
    expect(second).toBeGreaterThan(0.5);
    expect(second).toBeLessThan(1);
  });

  it("catches up within about 150ms of steady frames", () => {
    const playback = createPlayback<[number]>({ catchUpMs: 50 });
    let value = playback.at([[0, 0]], 0, 0, 16)![0];
    for (let now = 16; now <= 150; now += 16) {
      value = playback.at([[0, 1]], now, 0, 16)![0];
    }
    // catchUpMs = 50: after ~150ms (3 time constants) the exponential is within a few % of done.
    expect(value).toBeGreaterThan(0.93);
  });
});

describe("createPlayback: snap", () => {
  it("moves the drawn value to the given value over the given ms, then holds it", () => {
    const playback = createPlayback<[number, number]>();
    playback.at([[0, 0, 0]], 0, 0, 16); // drawn value settles at [0, 0]
    playback.snap([1, -1], 60);

    // The tween ignores the track entirely: it moves the drawn value, not the sample data.
    const mid = playback.at([], 30, 0, 30)!;
    expect(mid[0]).toBeCloseTo(0.5, 10);
    expect(mid[1]).toBeCloseTo(-0.5, 10);

    const done = playback.at([], 60, 0, 30)!;
    expect(done).toEqual([1, -1]);

    // Holds at the snapped value once the tween is done, with no track data to correct it.
    const after = playback.at([], 200, 0, 140)!;
    expect(after).toEqual([1, -1]);
  });

  it("snaps instantly when overMs is 0", () => {
    const playback = createPlayback<[number]>();
    playback.snap([0.7], 0);
    expect(playback.at([[0, 0]], 0, 0, 16)).toEqual([0.7]);
  });
});

/**
 * "Proving it" (docs/architecture/realtime-link.md, "Fallback detection and smoothing"): replays a
 * synthetic aim trace (no recordings exist yet in packages/motion/test/traces/, so a synthetic one
 * stands in, per this story's implementation notes) through the fake link at relay- and
 * direct-path rates and network conditions, and measures the drawn value against the true aim
 * `delayMs` earlier, in world pixels.
 */
describe("proving it: replaying a synthetic aim trace through the fake link", () => {
  // 200 world px per unit of aim (-1 to 1), the scale realtime-link.md's tuning gives Target
  // Range's yaw: ±200 px for the full ±1 range, the same in both directions (owner decision 14).
  const PX_PER_UNIT = 200;

  // A phone sweeping the aim, starting and ending at rest so a late "stop" message doesn't need to
  // out-run real deceleration: yaw eases out over 4 s, pitch settles earlier at 2.4 s and both hold
  // at [0, 0] after that, like a phone raised, moved and set back down.
  const YAW_AMPLITUDE = 0.6;
  const YAW_STOP_MS = 16_000;
  const PITCH_AMPLITUDE = 0.4;
  const PITCH_STOP_MS = 9_600;
  const MOTION_END_MS = Math.max(YAW_STOP_MS, PITCH_STOP_MS);

  function trueValue(t: number): [number, number] {
    return [hump(YAW_AMPLITUDE, YAW_STOP_MS, t), hump(PITCH_AMPLITUDE, PITCH_STOP_MS, t)];
  }

  function isMoving(playT: number): boolean {
    const step = 5;
    const a = trueValue(playT - step);
    const b = trueValue(playT + step);
    const speed = Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * step);
    return speed * PX_PER_UNIT > 2 / 1_000; // faster than 2 world px/s
  }

  function pxError(a: readonly [number, number], b: readonly [number, number]): number {
    return Math.hypot((a[0] - b[0]) * PX_PER_UNIT, (a[1] - b[1]) * PX_PER_UNIT);
  }

  interface ReplayResult {
    p90Error: number;
    maxErrorAfterStop: number;
    maxStallWhileMovingMs: number;
  }

  function replay(options: {
    rateHz: number;
    delayMs: number;
    jitterMs: number;
    loss: number;
    playbackDelayMs: number;
    seed: number;
  }): ReplayResult {
    const time = createVirtualTime();
    const random = seededRandom(options.seed);
    const link = createFakeLink({
      delayMs: options.delayMs,
      jitterMs: options.jitterMs,
      loss: options.loss,
      now: () => time.now,
      schedule: time.schedule,
      random,
    });

    let track: SampleTrack<[number, number]> = [];
    link.b.onMessage((data) => {
      const [atMs, yaw, pitch] = JSON.parse(data) as [number, number, number];
      track = addSample(track, atMs, [yaw, pitch]);
    });

    const sendIntervalMs = 1_000 / options.rateHz;
    for (let t = 0; t <= MOTION_END_MS; t += sendIntervalMs) {
      const atMs = Math.round(t);
      time.at(atMs, () => link.a.send(JSON.stringify([atMs, ...trueValue(atMs)])));
    }

    const playback = createPlayback<[number, number]>({ intervalMs: sendIntervalMs });
    const frameMs = 16;
    const totalMs = MOTION_END_MS + 900;
    const warmupMs = options.playbackDelayMs + 400;
    const settleAfterStopMs = options.playbackDelayMs + 400;

    const errors: number[] = [];
    const errorsAfterStop: number[] = [];
    let lastShown: [number, number] | null = null;
    let lastChangeAtMs = 0;
    let maxStallWhileMovingMs = 0;

    for (let now = 0; now <= totalMs; now += frameMs) {
      time.advanceTo(now);
      const shown = playback.at(track, now, options.playbackDelayMs, frameMs);
      if (shown === null) continue;

      if (lastShown === null || shown[0] !== lastShown[0] || shown[1] !== lastShown[1]) {
        lastChangeAtMs = now;
        lastShown = shown;
      } else if (isMoving(now - options.playbackDelayMs)) {
        maxStallWhileMovingMs = Math.max(maxStallWhileMovingMs, now - lastChangeAtMs);
      }

      if (now < warmupMs) continue;
      const truth = trueValue(now - options.playbackDelayMs);
      const error = pxError(truth, shown);
      errors.push(error);
      if (now >= MOTION_END_MS + settleAfterStopMs) errorsAfterStop.push(error);
    }

    errors.sort((a, b) => a - b);
    const p90Index = Math.floor(0.9 * (errors.length - 1));
    return {
      p90Error: errors[p90Index]!,
      maxErrorAfterStop: Math.max(0, ...errorsAfterStop),
      maxStallWhileMovingMs,
    };
  }

  it.each([30, 65, 100])(
    "relay path: 4 messages/s, %dms base delay, 20ms jitter, 2%% loss: p90 under 6 world px",
    (baseDelayMs) => {
      const result = replay({
        rateHz: 4,
        delayMs: baseDelayMs,
        jitterMs: 20,
        loss: 0.02,
        // "D starts at 180ms... tune it between 120 and 280ms": this replay is that tuning pass.
        // With 4 msg/s (250ms apart) and up to 120ms of network latency, 180ms is often outrun by
        // a message's actual age, so this replay settles on 280ms, the top of the tuning range.
        playbackDelayMs: 280,
        seed: 1_000 + baseDelayMs,
      });

      expect(result.p90Error).toBeLessThan(6);
      expect(result.maxErrorAfterStop).toBeLessThanOrEqual(4);
      expect(result.maxStallWhileMovingMs).toBeLessThanOrEqual(150);
    },
  );

  it("direct path: 30 messages/s, delay from measured jitter: p90 under 2 world px", () => {
    const rateHz = 30;
    const linkDelayMs = 5;
    const jitterMs = 10;
    // D = clamp(1000/hz + 2*jitter, 25, 120), "Smoothing on the direct path".
    const playbackDelayMs = Math.min(120, Math.max(25, 1_000 / rateHz + 2 * jitterMs));

    const result = replay({
      rateHz,
      delayMs: linkDelayMs,
      jitterMs,
      loss: 0,
      playbackDelayMs,
      seed: 42,
    });

    expect(result.p90Error).toBeLessThan(2);
    expect(result.maxErrorAfterStop).toBeLessThanOrEqual(4);
    expect(result.maxStallWhileMovingMs).toBeLessThanOrEqual(150);
  });
});
