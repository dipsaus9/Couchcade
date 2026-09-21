import { describe, expect, it } from "vitest";
import type { PoseReading } from "@couchcade/motion/calibration";
import {
  createShakeDetector,
  SHAKE_COOLDOWN_MS,
  SHAKE_PEAK_THRESHOLD,
  SHAKE_PEAK_WINDOW_MS,
  SHAKE_REARM_QUIET_MS,
  SHAKE_REARM_THRESHOLD,
  type Shake,
  type ShakeDetectorOptions,
} from "@couchcade/motion/gestures";
import type { Trace } from "@couchcade/motion/sensors";
import { GAP_MS, PEAK_MS, replay, shakeTrace, type ShakeTraceSpec } from "./traces.ts";

/** Room time equals local time in these tests, so `at` reads as the trace's own time. */
const localTime = (t: number) => t;

const detect = (spec: ShakeTraceSpec, options: ShakeDetectorOptions = {}) =>
  replay(shakeTrace(spec), createShakeDetector({ toRoomTime: localTime, ...options }));

/** A phone lying flat, pushed along `x` in half-sine acceleration pulses. */
function readings(
  pulses: Array<{ peak: number; centerMs: number; durationMs?: number }>,
  endMs: number,
): PoseReading[] {
  const out: PoseReading[] = [];
  const count = Math.round((endMs * 60) / 1000);
  for (let i = 0; i <= count; i++) {
    const t = (i * 1000) / 60;
    let ax = 0;
    for (const { peak, centerMs, durationMs = 80 } of pulses) {
      const phase = (t - (centerMs - durationMs / 2)) / durationMs;
      if (phase > 0 && phase < 1) ax += peak * Math.sin(Math.PI * phase);
    }
    out.push({
      t,
      interval: 1000 / 60,
      acceleration: { x: ax, y: 0, z: 0 },
      gravityAcceleration: { x: 0, y: 0, z: 9.81 },
      rotationRate: null,
      orientation: { w: 1, x: 0, y: 0, z: 0 },
    });
  }
  return out;
}

/** 60 Hz sample times are thirds of a millisecond; this is the sample at or just after `ms`. */
const at = (ms: number) => (Math.ceil((ms * 60) / 1000 - 1e-9) * 1000) / 60;

function run(input: PoseReading[], options: ShakeDetectorOptions = {}) {
  const detector = createShakeDetector({ toRoomTime: localTime, ...options });
  const emitted: Array<{ shake: Shake; t: number }> = [];
  detector.on((shake, t) => emitted.push({ shake, t }));
  for (const reading of input) detector.push(reading);
  return { detector, emitted };
}

describe("createShakeDetector", () => {
  describe("replays synthetic shake traces", () => {
    it.each<[string, ShakeTraceSpec, Trace["expect"]]>([
      ["a firm push-pull shake", { peak: 20 }, { events: 1 }],
      ["just over the 14 m/s² threshold", { peak: 14.5 }, { events: 1 }],
      ["under the threshold", { peak: 10 }, { events: 0 }],
      ["a push without a pull-back", { peak: 20, opposite: false }, { events: 0 }],
    ])("%s", (_, spec, expected) => {
      const trace = shakeTrace({ ...spec, expect: expected });
      expect(trace.v).toBe(1);
      expect(trace.gesture).toBe(spec.peak > 0 ? "shake" : "still");
      expect(replay(trace, createShakeDetector({ toRoomTime: localTime }))).toHaveLength(
        expected.events,
      );
      expect(
        replay(
          shakeTrace({ ...spec, expect: expected, rawSigns: "inverted" }),
          createShakeDetector({ toRoomTime: localTime }),
        ),
      ).toHaveLength(expected.events);
    });
  });

  it("emits at the second peak's time", () => {
    expect(SHAKE_PEAK_THRESHOLD).toBe(14);
    const emitted = detect({ peak: 20 });
    expect(emitted).toEqual([{ shake: { at: PEAK_MS }, t: PEAK_MS }]);
  });

  it("emits nothing for two peaks more than 400 ms apart", () => {
    expect(SHAKE_PEAK_WINDOW_MS).toBe(400);
    expect(detect({ peak: 20, gapMs: 500 })).toEqual([]);
  });

  it("takes a game-tuned threshold and window", () => {
    expect(detect({ peak: 12 }, { peakThreshold: 10 })).toHaveLength(1);
    expect(detect({ peak: 20, gapMs: 500 }, { peakWindowMs: 600 })).toHaveLength(1);
  });

  describe("hysteresis (AC#1: one shake, one event)", () => {
    it("a sustained shake that keeps crossing the threshold emits only once", () => {
      expect(SHAKE_REARM_THRESHOLD).toBe(4);
      expect(SHAKE_REARM_QUIET_MS).toBe(300);
      // Four alternating pulses 150 ms apart: the first pair (100, 250) pairs and emits. The
      // 70 ms gaps between the later pulses never stay under 4 m/s² for the full 300 ms the
      // detector needs to re-arm, so peaks 3 and 4 are ignored even though they'd otherwise pair.
      const input = readings(
        [
          { peak: 20, centerMs: 100 },
          { peak: -20, centerMs: 250 },
          { peak: 20, centerMs: 400 },
          { peak: -20, centerMs: 550 },
        ],
        900,
      );
      const { emitted } = run(input);
      expect(emitted.map(({ t }) => t)).toEqual([at(250)]);
    });

    it("re-arms once the magnitude has stayed under 4 m/s² for 300 ms, and can shake again", () => {
      const input = readings(
        [
          { peak: 20, centerMs: 100 },
          { peak: -20, centerMs: 250 },
          // Quiet from ~290 to past 590 (300 ms), well clear of the 700 ms cooldown too.
          { peak: 20, centerMs: 1200 },
          { peak: -20, centerMs: 1350 },
        ],
        1500,
      );
      const { emitted } = run(input);
      expect(emitted.map(({ t }) => t)).toEqual([at(250), at(1350)]);
    });

    it("hovering near the threshold without ever crossing it emits nothing", () => {
      const input = readings(
        [
          { peak: 13, centerMs: 100 },
          { peak: -13, centerMs: 250 },
        ],
        500,
      );
      expect(run(input).emitted).toEqual([]);
    });
  });

  describe("cooldown", () => {
    it("blocks a second pair inside 700 ms of the last emit even once re-armed", () => {
      expect(SHAKE_COOLDOWN_MS).toBe(700);
      const input = readings(
        [
          { peak: 20, centerMs: 100 }, // pairs with the next, emits at 250
          { peak: -20, centerMs: 250 },
          // Quiet from ~290 to past 590: re-armed well before the next pulse at 650.
          { peak: 20, centerMs: 650 }, // pairs with the next, but only 500 ms after the last emit
          { peak: -20, centerMs: 750 },
          // Stale by the time the next pulse comes (gap from 750 is 450 ms > 400 ms window).
          { peak: 20, centerMs: 1200 },
          { peak: -20, centerMs: 1300 }, // 1,050 ms after the first emit: cooldown has passed
        ],
        1500,
      );
      const { emitted } = run(input);
      expect(emitted.map(({ t }) => t)).toEqual([at(250), at(1300)]);
    });
  });

  describe("direction", () => {
    it("emits nothing for two peaks pointing the same way", () => {
      const input = readings(
        [
          { peak: 20, centerMs: 100 },
          { peak: 20, centerMs: 250 },
        ],
        500,
      );
      expect(run(input).emitted).toEqual([]);
    });
  });

  it("reads linear acceleration from gravity when the platform gives no `acceleration` field", () => {
    const input = readings(
      [
        { peak: 20, centerMs: 100 },
        { peak: -20, centerMs: 250 },
      ],
      500,
    ).map((reading) => ({
      ...reading,
      acceleration: null,
      gravityAcceleration: { x: reading.acceleration?.x ?? 0, y: 0, z: 9.81 },
    }));
    expect(run(input).emitted).toHaveLength(1);

    const still = input.map((reading) => ({
      ...reading,
      gravityAcceleration: { x: 0, y: 0, z: 9.81 },
    }));
    expect(run(still).emitted).toEqual([]);
  });

  it("reset forgets the peak in progress, the re-arm wait and the cooldown, and keeps the listeners", () => {
    const input = readings(
      [
        { peak: 20, centerMs: 100 },
        { peak: -20, centerMs: 250 },
      ],
      500,
    );
    // Up to ~200 ms in: the first peak has landed, the second pulse hasn't started yet.
    const upToFirstPeak = input.filter((reading) => reading.t <= 200);
    const { detector, emitted } = run(upToFirstPeak);
    expect(emitted).toEqual([]);

    detector.reset();
    for (const reading of input) detector.push(reading);
    expect(emitted).toHaveLength(1);
  });

  it("rounds `at` to a whole number and reports only the `at` field", () => {
    const input = readings(
      [
        { peak: 20, centerMs: 100.37 },
        { peak: -20, centerMs: 250.37 },
      ],
      500,
    );
    const [{ shake, t }] = run(input).emitted as [{ shake: Shake; t: number }];
    expect(Object.keys(shake)).toEqual(["at"]);
    expect(shake.at).toBe(Math.round(t));
    expect(Number.isInteger(shake.at)).toBe(true);
  });

  it("converts at to room time on the shared room clock by default", () => {
    const [emitted] = replay(shakeTrace({ peak: 20 }), createShakeDetector());
    const timeOrigin = (globalThis as unknown as { performance: { timeOrigin: number } })
      .performance.timeOrigin;
    expect(emitted?.t).toBe(PEAK_MS);
    // Before the clock syncs its offset is 0, so room time is the device's own epoch time.
    expect(emitted?.shake.at).toBe(Math.round(timeOrigin + PEAK_MS));
  });

  it("the default gap stays inside the peak window", () => {
    expect(GAP_MS).toBeLessThanOrEqual(SHAKE_PEAK_WINDOW_MS);
  });
});
