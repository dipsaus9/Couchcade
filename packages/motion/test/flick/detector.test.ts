import { describe, expect, it } from "vitest";
import type { PoseReading } from "@couchcade/motion/calibration";
import {
  createFlickDetector,
  FLICK_COOLDOWN_MS,
  FLICK_FULL_RATE,
  FLICK_MIN_ACCELERATION,
  FLICK_MIN_RATE,
  type Flick,
  type FlickDetectorOptions,
} from "@couchcade/motion/gestures";
import type { Trace } from "@couchcade/motion/sensors";
import { flickTrace, type FlickTraceSpec, PEAK_MS, replay } from "./traces.ts";

/** Room time equals local time in these tests, so `at` reads as the trace's own time. */
const localTime = (t: number) => t;

const detect = (spec: FlickTraceSpec, options: FlickDetectorOptions = {}) =>
  replay(flickTrace(spec), createFlickDetector({ toRoomTime: localTime, ...options }));

const only = (spec: FlickTraceSpec, options: FlickDetectorOptions = {}): Flick => {
  const emitted = detect(spec, options);
  expect(emitted).toHaveLength(1);
  return (emitted[0] as { flick: Flick }).flick;
};

/** Asserts a trace's `expect`: the event count and each field's allowed range. */
function expectTrace(trace: Trace) {
  const emitted = replay(trace, createFlickDetector({ toRoomTime: localTime }));
  expect(emitted).toHaveLength(trace.expect.events);
  for (const { flick } of emitted) {
    for (const [field, [min, max]] of Object.entries(trace.expect.fields ?? {})) {
      // The field name goes into the value checked, so a failure says which field is out of range.
      expect({ [field]: flick[field as keyof Flick] }).toEqual({
        [field]: expect.toSatisfy((value: number) => value >= min && value <= max),
      });
    }
  }
}

type Mark = [number, "grip-down" | "grip-up" | "recentre"];

/**
 * A phone pointing at the TV (motion frame), pitching down in half-sine pulses, with 10 m/s² of
 * linear acceleration at the times `accelerationAt` picks (by default all of them).
 */
function readings(
  pulses: Array<{ peak: number; peakMs: number; durationMs?: number }>,
  accelerationAt: (t: number) => boolean = () => true,
  endMs = 2500,
): PoseReading[] {
  const out: PoseReading[] = [];
  for (let i = 0; i <= Math.round((endMs * 60) / 1000); i++) {
    const t = (i * 1000) / 60;
    let rate = 0;
    for (const { peak, peakMs, durationMs = 100 } of pulses) {
      const phase = (t - (peakMs - durationMs / 2)) / durationMs;
      if (phase > 0 && phase < 1) rate += peak * Math.sin(Math.PI * phase);
    }
    out.push({
      t,
      interval: 1000 / 60,
      acceleration: { x: 0, y: accelerationAt(t) ? 10 : 0, z: 0 },
      gravityAcceleration: { x: 0, y: 0, z: 9.81 },
      // Pitching the top edge (forward) down is a negative rate around right.
      rotationRate: { x: -rate, y: 0, z: 0 },
      orientation: { w: 1, x: 0, y: 0, z: 0 },
    });
  }
  return out;
}

/** 60 Hz sample times are thirds of a millisecond; this is the sample at or just after `ms`. */
const at = (ms: number) => (Math.ceil((ms * 60) / 1000 - 1e-9) * 1000) / 60;

describe("createFlickDetector", () => {
  describe("replays synthetic flick traces", () => {
    it.each<[string, FlickTraceSpec, Trace["expect"]]>([
      [
        "a medium straight throw",
        { peak: 750 },
        { events: 1, fields: { power: [0.45, 0.55], direction: [-2, 2], wobble: [0, 0.05] } },
      ],
      [
        "a firm throw pulled right",
        { peak: 1000, pull: 12 },
        { events: 1, fields: { power: [0.7, 0.85], direction: [10, 14] } },
      ],
      [
        "a soft throw with a twisted wrist",
        { peak: 500, twist: 300 },
        { events: 1, fields: { power: [0.15, 0.3], wobble: [0.5, 0.7] } },
      ],
      ["a phone held still with the grip down", { peak: 0 }, { events: 0 }],
    ])("%s", (_, spec, expected) => {
      const trace = flickTrace({ ...spec, expect: expected });
      expect(trace.v).toBe(1);
      expect(trace.gesture).toBe(spec.peak > 0 ? "flick" : "still");
      expectTrace(trace);
      expectTrace(flickTrace({ ...spec, expect: expected, rawSigns: "inverted" }));
    });
  });

  describe("power", () => {
    it("is 0 at 300 deg/s and 1 at a firm 1,200 deg/s", () => {
      expect([FLICK_MIN_RATE, FLICK_FULL_RATE]).toEqual([300, 1200]);
    });

    it.each([
      ["just over the threshold", 310, 0.01],
      ["soft", 480, 0.2],
      ["medium", 750, 0.5],
      ["firm", 1200, 1],
      ["over-firm", 1500, 1],
    ])("a %s flick (%i deg/s) has power %s, and flicking harder adds nothing", (_, peak, power) => {
      expect(detect({ peak })).toEqual([
        { flick: { power, direction: 0, wobble: 0, at: PEAK_MS }, t: PEAK_MS },
      ]);
    });

    it("takes a game-tuned minimum rate", () => {
      expect(only({ peak: 750 }, { minRate: 400, fullRate: 1100 }).power).toBe(0.5);
      expect(detect({ peak: 350 }, { minRate: 400 })).toEqual([]);
    });
  });

  describe("emits nothing", () => {
    it("for a snap under 300 deg/s", () => {
      expect(detect({ peak: 250 })).toEqual([]);
    });

    it("for lowering the phone calmly", () => {
      expect(detect({ peak: 120, cock: 0 })).toEqual([]);
    });

    it("for turning the phone fast in place, without the acceleration of a throw", () => {
      expect(FLICK_MIN_ACCELERATION).toBe(6);
      expect(detect({ peak: 900, radiusM: 0 })).toEqual([]);
    });

    it("for a throw without the grip held", () => {
      expect(detect({ peak: 900, grip: false })).toEqual([]);
    });
  });

  describe("direction", () => {
    it.each([
      ["straight", 0],
      ["pulled right", 10],
      ["pulled left", -20],
    ])("follows a throw %s", (_, pull) => {
      expect(Math.abs(only({ peak: 800, pull }).direction - pull)).toBeLessThanOrEqual(1);
    });

    it("is clamped to ±30°", () => {
      expect(only({ peak: 800, pull: 50 }).direction).toBe(30);
      expect(only({ peak: 800, pull: -50 }).direction).toBe(-30);
    });

    it("is measured from where the phone was aiming, not from the TV", () => {
      // The player turned 40° to the right before gripping.
      expect(only({ peak: 800, turn: 40 }).direction).toBe(0);
      expect(Math.abs(only({ peak: 800, turn: 40, pull: 15 }).direction - 15)).toBeLessThanOrEqual(
        1,
      );
    });

    it("isn't moved by twisting the wrist", () => {
      expect(Math.abs(only({ peak: 800, twist: 400 }).direction)).toBeLessThanOrEqual(3);
    });

    it("works when the throw starts with the phone cocked nearly upright", () => {
      expect(only({ peak: 800, cock: 70 })).toEqual({
        power: 0.56,
        direction: 0,
        wobble: 0,
        at: PEAK_MS,
      });
    });
  });

  describe("wobble", () => {
    it("is 0 for a clean flick", () => {
      expect(only({ peak: 800 }).wobble).toBe(0);
    });

    it("is the twist rate over the pitch rate", () => {
      expect(Math.abs(only({ peak: 800, twist: 400 }).wobble - 0.5)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(only({ peak: 800, twist: -400 }).wobble - 0.5)).toBeLessThanOrEqual(0.02);
    });

    it("counts a sideways swerve too", () => {
      expect(only({ peak: 800, pull: 20 }).wobble).toBeGreaterThan(0.3);
    });

    it("is clamped to 1", () => {
      expect(only({ peak: 800, twist: 2000 }).wobble).toBe(1);
    });
  });

  it.each(["w3c", "inverted"] as const)(
    "gives the same flick for both gravity sign conventions (%s)",
    (rawSigns: Trace["rawSigns"]) => {
      const spec = { peak: 900, pull: 12, twist: 200 };
      const expected = detect(spec);
      expect(expected).toHaveLength(1);
      expect(detect({ ...spec, rawSigns })).toEqual(expected);
    },
  );

  it("still emits a throw whose grip was let go right at the peak", () => {
    expect(detect({ peak: 800, gripUpMs: PEAK_MS + 1 })).toHaveLength(1);
  });

  describe("pure readings", () => {
    function run(
      input: PoseReading[],
      marks: Mark[] = [[0, "grip-down"]],
      options: FlickDetectorOptions = {},
    ) {
      const detector = createFlickDetector({ toRoomTime: localTime, ...options });
      const emitted: Array<{ flick: Flick; t: number; after: number }> = [];
      let latest = -1;
      detector.on((flick, t) => emitted.push({ flick, t, after: latest }));
      const pending = [...marks];
      for (const reading of input) {
        while (pending[0] && pending[0][0] < reading.t) {
          const [t, type] = pending.shift() as Mark;
          detector.mark({ type, t });
        }
        latest = reading.t;
        detector.push(reading);
      }
      for (const [t, type] of pending) detector.mark({ type, t });
      return { detector, emitted };
    }

    const peakMs = at(500);

    it.each([
      ["80 ms before the peak", -80, true],
      ["at the peak", 0, true],
      ["80 ms after the peak", 80, true],
      ["120 ms before the peak", -120, false],
      ["120 ms after the peak", 120, false],
    ])("needs acceleration within 100 ms of the peak: %s", (_, offset, emits) => {
      // A slow 300 ms pulse, so the rate is over 300 deg/s from well before to well after the peak.
      const burst = at(peakMs + offset);
      const input = readings([{ peak: 750, peakMs, durationMs: 300 }], (t) => t === burst);
      const { emitted } = run(input);
      expect(emitted.map(({ t }) => t)).toEqual(emits ? [peakMs] : []);
    });

    it("emits once the acceleration has come, even after the grip was let go at the peak", () => {
      const burst = at(peakMs + 80);
      const input = readings([{ peak: 750, peakMs }], (t) => t === burst);
      const { emitted } = run(input, [
        [0, "grip-down"],
        [peakMs + 1, "grip-up"],
      ]);
      expect(emitted).toEqual([
        {
          flick: { power: 0.5, direction: 0, wobble: 0, at: Math.round(peakMs) },
          t: peakMs,
          after: burst,
        },
      ]);
    });

    it("throws once per grip", () => {
      const input = readings([
        { peak: 900, peakMs: at(300) },
        { peak: 1200, peakMs: at(1400) },
      ]);
      const { emitted } = run(input);
      expect(emitted.map(({ t }) => t)).toEqual([at(300)]);
    });

    it("throws again on the next grip, once 800 ms have passed since the last throw", () => {
      expect(FLICK_COOLDOWN_MS).toBe(800);
      const input = readings([
        { peak: 900, peakMs: at(300) },
        { peak: 900, peakMs: at(900) },
        { peak: 900, peakMs: at(1400) },
      ]);
      const { emitted } = run(input, [
        [0, "grip-down"],
        [500, "grip-up"],
        [600, "grip-down"],
        [1000, "grip-up"],
        [1100, "grip-down"],
      ]);
      expect(emitted.map(({ t }) => t)).toEqual([at(300), at(1400)]);
    });

    it("ignores recentre marks, repeated grip-downs and readings without a rotation rate", () => {
      const input = readings([{ peak: 900, peakMs: at(300) }]).map((reading, i) =>
        i % 5 === 0 ? { ...reading, rotationRate: null } : reading,
      );
      const { emitted } = run(input, [
        [0, "grip-down"],
        [10, "grip-down"],
        [20, "recentre"],
      ]);
      expect(emitted).toHaveLength(1);
    });

    it("reads linear acceleration from gravity when the platform gives none", () => {
      const input = readings([{ peak: 900, peakMs: at(300) }]).map((reading) => ({
        ...reading,
        acceleration: null,
        gravityAcceleration: { x: 0, y: 10, z: 9.81 },
      }));
      expect(run(input).emitted).toHaveLength(1);
      const still = input.map((reading) => ({
        ...reading,
        gravityAcceleration: { x: 0, y: 0, z: 9.81 },
      }));
      expect(run(still).emitted).toEqual([]);
    });

    it("reset forgets the grip, the flick in progress and the cooldown, and keeps the listeners", () => {
      const input = readings([{ peak: 900, peakMs: at(300) }]);
      const { detector, emitted } = run(input.slice(0, 17));
      detector.reset();
      for (const reading of input.slice(17)) detector.push(reading);
      expect(emitted).toEqual([]);

      detector.mark({ type: "grip-down", t: 0 });
      for (const reading of input) detector.push(reading);
      expect(emitted).toHaveLength(1);
    });

    it("rounds power and wobble to 2 decimals and direction and at to whole numbers", () => {
      const input = readings([{ peak: 777, peakMs: at(300) }]).map((reading) => ({
        ...reading,
        t: reading.t + 0.37,
        rotationRate: reading.rotationRate && {
          ...reading.rotationRate,
          y: 0.123 * reading.rotationRate.x,
          z: -0.0717 * reading.rotationRate.x,
        },
      }));
      const [{ flick, t }] = run(input).emitted as [{ flick: Flick; t: number; after: number }];
      expect(Object.keys(flick).toSorted()).toEqual(["at", "direction", "power", "wobble"]);
      expect(Number.isInteger(flick.direction)).toBe(true);
      expect(flick.at).toBe(Math.round(t));
      expect(Math.round(flick.power * 100) / 100).toBe(flick.power);
      expect(Math.round(flick.wobble * 100) / 100).toBe(flick.wobble);
      expect(flick.wobble).toBeGreaterThan(0);
    });
  });

  it("converts at to room time on the shared room clock by default", () => {
    const [emitted] = replay(flickTrace({ peak: 800 }), createFlickDetector());
    const timeOrigin = (globalThis as unknown as { performance: { timeOrigin: number } })
      .performance.timeOrigin;
    expect(emitted?.t).toBe(PEAK_MS);
    // Before the clock syncs its offset is 0, so room time is the device's own epoch time.
    expect(emitted?.flick.at).toBe(Math.round(timeOrigin + PEAK_MS));
  });
});
