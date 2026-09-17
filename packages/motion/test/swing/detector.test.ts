import { describe, expect, it } from "vitest";
import { calibrateRest, createPoseTracker, type PoseReading } from "@couchcade/motion/calibration";
import {
  createSwingDetector,
  SWING_FULL_PEAK,
  SWING_FULL_SPIN_RATE,
  SWING_MIN_PEAK,
  type Swing,
  type SwingDetectorOptions,
} from "@couchcade/motion/gestures";
import { synthetic, type Trace, traceSamples, type TraceVector } from "@couchcade/motion/sensors";
import { noise } from "../calibration/traces.ts";
import { PEAK_MS, replay, swingTrace, type SwingTraceSpec } from "./traces.ts";

/** Room time equals local time in these tests, so `peakAt` reads as the trace's own time. */
const localTime = (t: number) => t;

const detect = (spec: SwingTraceSpec, options: SwingDetectorOptions = {}) =>
  replay(swingTrace(spec), createSwingDetector({ toRoomTime: localTime, ...options }));

const only = (spec: SwingTraceSpec, options: SwingDetectorOptions = {}): Swing => {
  const emitted = detect(spec, options);
  expect(emitted).toHaveLength(1);
  return (emitted[0] as { swing: Swing }).swing;
};

/** A phone lying in the motion frame, turning around its right axis in half-sine pulses. */
function readings(pulses: Array<{ peak: number; startMs: number; durationMs: number }>) {
  const out: PoseReading[] = [];
  for (let i = 0; i <= 150; i++) {
    const t = (i * 1000) / 60;
    let rate = 0;
    for (const { peak, startMs, durationMs } of pulses) {
      const phase = (t - startMs) / durationMs;
      if (phase > 0 && phase < 1) rate += peak * Math.sin(Math.PI * phase);
    }
    out.push({
      t,
      interval: 1000 / 60,
      acceleration: { x: 0, y: rate / 100, z: 0 },
      gravityAcceleration: { x: 0, y: 0, z: 9.81 },
      rotationRate: { x: rate, y: 0, z: 0 },
      orientation: { w: 1, x: 0, y: 0, z: 0 },
    });
  }
  return out;
}

describe("createSwingDetector", () => {
  describe("speed", () => {
    it("is 0 at 240 deg/s and 1 at a firm 900 deg/s", () => {
      expect([SWING_MIN_PEAK, SWING_FULL_PEAK]).toEqual([240, 900]);
    });

    it.each([
      ["slow", 300, 0.09],
      ["medium", 570, 0.5],
      ["firm", 900, 1],
      ["over-firm", 1400, 1],
    ])("a %s swing (%i deg/s) has speed %s, and swinging harder adds nothing", (_, peak, speed) => {
      const emitted = detect({ peak });
      expect(emitted).toEqual([
        { swing: { speed, angle: 0, spin: 0, peakAt: PEAK_MS }, t: PEAK_MS },
      ]);
    });

    it("takes game-tuned minimum and full peaks", () => {
      expect(only({ peak: 570 }, { minPeak: 400, fullPeak: 740 }).speed).toBe(0.5);
      expect(detect({ peak: 300 }, { minPeak: 400 })).toEqual([]);
    });
  });

  describe("movement below the threshold emits nothing", () => {
    it("holding still with the grip down", () => {
      expect(detect({ peak: 0 })).toEqual([]);
    });

    it("a flinch that passes the start rate but peaks under 240 deg/s", () => {
      expect(detect({ peak: 200 })).toEqual([]);
    });

    it.each([
      ["under the start rate", 60],
      ["crossing the start rate but under the minimum peak", 130],
    ])("a shaky hand %s", (_, amplitude) => {
      const random = noise(7);
      const jitter = (): TraceVector => [random(amplitude), random(amplitude), random(amplitude)];
      for (const emitOn of ["peak", "release"] as const) {
        expect(detect({ peak: 0, jitter }, { emitOn })).toEqual([]);
      }
    });

    it("a firm swing without the grip held", () => {
      const trace = { ...swingTrace({ peak: 900 }), marks: [] };
      expect(replay(trace, createSwingDetector({ toRoomTime: localTime }))).toEqual([]);
    });
  });

  describe("angle", () => {
    it.each([
      ["a straight bowl", 0],
      ["to the right", 30],
      ["a forehand crossing the body to the left", -40],
      ["a backhand to the right", 70],
    ])("follows %s", (_, angle) => {
      expect(Math.abs(only({ peak: 700, angle }).angle - angle)).toBeLessThanOrEqual(3);
    });

    it("is measured from where the phone faced at grip-down", () => {
      // The player turned 30° to the right before gripping, then bowled straight.
      expect(Math.abs(only({ peak: 700, turn: 30 }).angle)).toBeLessThanOrEqual(3);
      expect(Math.abs(only({ peak: 700, turn: 30, angle: 20 }).angle - 20)).toBeLessThanOrEqual(3);
    });
  });

  describe("spin", () => {
    it("is 0 without a wrist twist", () => {
      expect(only({ peak: 700 }).spin).toBe(0);
    });

    it("twisting clockwise curves right, anticlockwise left, by the same amount", () => {
      const right = only({ peak: 700, twist: 400 });
      const left = only({ peak: 700, twist: -400 });
      expect(right.spin).toBeGreaterThan(0.3);
      expect(left.spin).toBe(-right.spin);
      expect(Math.abs(right.angle)).toBeLessThanOrEqual(5);
      expect(left.angle).toBe(-right.angle);
    });

    it("clamps at a mean twist of 540 deg/s", () => {
      expect(SWING_FULL_SPIN_RATE).toBe(540);
      expect(only({ peak: 700, twist: 1500 }).spin).toBe(1);
      expect(only({ peak: 700, twist: -1500 }).spin).toBe(-1);
    });
  });

  it.each(["w3c", "inverted"] as const)(
    "gives the same swing for both gravity sign conventions (%s)",
    (rawSigns: Trace["rawSigns"]) => {
      const spec = { peak: 800, angle: 25, twist: 300 };
      const expected = detect(spec);
      expect(expected).toHaveLength(1);
      expect(detect({ ...spec, rawSigns })).toEqual(expected);
    },
  );

  describe("grip released mid-swing", () => {
    it("ends the swing there: only what came before counts", () => {
      const gripUpMs = PEAK_MS - 60;
      for (const emitOn of ["peak", "release"] as const) {
        const emitted = detect({ peak: 700, gripUpMs }, { emitOn });
        expect(emitted).toHaveLength(1);
        const [{ swing, t }] = emitted as [{ swing: Swing; t: number }];
        expect(swing.speed).toBeGreaterThan(0);
        expect(swing.speed).toBeLessThan(only({ peak: 700 }).speed);
        expect(t).toBeLessThanOrEqual(gripUpMs);
        expect(swing.peakAt).toBe(Math.round(t));
      }
    });

    it("emits nothing when the grip goes before the swing reaches 240 deg/s", () => {
      // The forward swing starts 135 ms before its peak; 20 ms in, it is still slow.
      const gripUpMs = PEAK_MS - 115;
      for (const emitOn of ["peak", "release"] as const) {
        expect(detect({ peak: 700, gripUpMs }, { emitOn })).toEqual([]);
      }
    });
  });

  describe('emitOn "release"', () => {
    it("emits at grip-up the swing that peaked in the 300 ms before it", () => {
      const swings: Swing[] = [];
      const detector = createSwingDetector({ emitOn: "release", toRoomTime: localTime });
      detector.on((swing) => swings.push(swing));
      const trace = swingTrace({ peak: 700, gripUpMs: PEAK_MS + 250 });
      const emitted = replay(trace, detector);
      expect(emitted).toEqual([
        { swing: { speed: 0.7, angle: 0, spin: 0, peakAt: PEAK_MS }, t: PEAK_MS },
      ]);
      expect(swings).toEqual([emitted[0]?.swing]);
    });

    it("emits nothing when the grip is held longer, so a player can let go and grip again", () => {
      expect(detect({ peak: 700, gripUpMs: PEAK_MS + 350 }, { emitOn: "release" })).toEqual([]);
    });
  });

  describe("pure readings", () => {
    function run(
      input: PoseReading[],
      options: SwingDetectorOptions,
      marks: Array<[number, "grip-down" | "grip-up" | "recentre"]> = [[0, "grip-down"]],
    ) {
      const detector = createSwingDetector({ toRoomTime: localTime, ...options });
      const emitted: Array<[Swing, number]> = [];
      detector.on((swing, t) => emitted.push([swing, t]));
      const pending = [...marks];
      for (const reading of input) {
        while (pending[0] && pending[0][0] < reading.t) {
          const [t, type] = pending.shift() as [number, "grip-down"];
          detector.mark({ type, t });
        }
        detector.push(reading);
      }
      for (const [t, type] of pending) detector.mark({ type, t });
      return { detector, emitted };
    }

    it('"peak" emits each swing as it ends, once the rate has stayed under 60 deg/s for 100 ms', () => {
      const { emitted } = run(
        readings([
          { peak: 570, startMs: 100, durationMs: 300 },
          { peak: 900, startMs: 1200, durationMs: 300 },
        ]),
        { emitOn: "peak" },
      );
      expect(emitted.map(([swing]) => swing.speed)).toEqual([0.5, 1]);
      expect(emitted.map(([swing]) => swing.peakAt)).toEqual([250, 1350]);
    });

    it('"peak" ignores a swing starting within 400 ms of the end of the last one', () => {
      // The first swing ends about 100 ms after its last fast sample (~480 ms); the bounce starts at 700.
      const { emitted } = run(
        readings([
          { peak: 900, startMs: 100, durationMs: 300 },
          { peak: 600, startMs: 700, durationMs: 300 },
          { peak: 600, startMs: 1500, durationMs: 300 },
        ]),
        { emitOn: "peak" },
      );
      expect(emitted.map(([swing]) => swing.peakAt)).toEqual([250, 1650]);
    });

    it("keeps a brief dip under 60 deg/s inside one swing", () => {
      const { emitted } = run(
        readings([
          { peak: 400, startMs: 100, durationMs: 300 },
          { peak: 800, startMs: 450, durationMs: 300 },
        ]),
        { emitOn: "peak" },
      );
      expect(emitted.map(([swing]) => swing.peakAt)).toEqual([600]);
    });

    it('"release" emits once per grip, the last swing', () => {
      const { emitted } = run(
        readings([
          { peak: 900, startMs: 100, durationMs: 300 },
          { peak: 570, startMs: 1200, durationMs: 300 },
        ]),
        { emitOn: "release" },
        [
          [0, "grip-down"],
          [1500, "grip-up"],
        ],
      );
      expect(emitted.map(([swing]) => [swing.speed, swing.peakAt])).toEqual([[0.5, 1350]]);
    });

    it("ignores recentre marks, repeated grip marks and readings without a rotation rate", () => {
      const input = readings([{ peak: 900, startMs: 100, durationMs: 300 }]).map((reading, i) =>
        i % 5 === 0 ? { ...reading, rotationRate: null } : reading,
      );
      const { emitted } = run(input, { emitOn: "peak" }, [
        [0, "grip-down"],
        [10, "grip-down"],
        [20, "recentre"],
      ]);
      expect(emitted).toHaveLength(1);
    });

    it("reset forgets the grip and the swing in progress, and keeps the listeners", () => {
      const input = readings([{ peak: 900, startMs: 100, durationMs: 300 }]);
      const { detector, emitted } = run(input.slice(0, 20), { emitOn: "peak" });
      detector.reset();
      for (const reading of input.slice(20)) detector.push(reading);
      expect(emitted).toEqual([]);

      detector.mark({ type: "grip-down", t: 0 });
      for (const reading of input) detector.push(reading);
      expect(emitted).toHaveLength(1);
    });

    it("rounds speed and spin to 2 decimals and angle and peakAt to whole numbers", () => {
      const { emitted } = run(
        readings([{ peak: 555, startMs: 100, durationMs: 290 }]).map((reading) => ({
          ...reading,
          t: reading.t + 0.37,
        })),
        { emitOn: "peak" },
      );
      const [[swing, t]] = emitted as [[Swing, number]];
      expect(Object.keys(swing).toSorted()).toEqual(["angle", "peakAt", "speed", "spin"]);
      expect(Number.isInteger(swing.angle)).toBe(true);
      expect(swing.peakAt).toBe(Math.round(t));
      expect(Math.round(swing.speed * 100) / 100).toBe(swing.speed);
      expect(Math.round(swing.spin * 100) / 100).toBe(swing.spin);
    });
  });

  it("replays synthetic.swing from the sensors package", () => {
    const still = synthetic.still({ durationMs: 1200 });
    const swing = synthetic.swing({ peak: 600 });
    const offset = 1200 + 1000 / 60;
    const samples = [
      ...traceSamples(still),
      ...traceSamples(swing).map((sample) => ({ ...sample, t: sample.t + offset })),
    ];
    const calibration = calibrateRest(samples);
    if (!calibration) throw new Error("calibration did not complete");
    const tracker = createPoseTracker(calibration);
    const detector = createSwingDetector({ toRoomTime: localTime });
    const emitted: Swing[] = [];
    detector.on((event) => emitted.push(event));
    const marks = swing.marks.map(([t, type]) => ({ t: t + offset, type }));
    for (const sample of samples.filter((s) => s.t > calibration.t)) {
      while (marks[0] && marks[0].t < sample.t) detector.mark(marks.shift() as (typeof marks)[0]);
      detector.push(tracker.push(sample));
    }
    for (const mark of marks) detector.mark(mark);

    expect(emitted).toHaveLength(swing.expect.events);
    expect(emitted[0]).toEqual({
      speed: 0.55,
      angle: 0,
      spin: 0,
      peakAt: Math.round(offset + 350),
    });
  });

  it("converts peakAt to room time on the shared room clock by default", () => {
    const [emitted] = replay(swingTrace({ peak: 700 }), createSwingDetector());
    const timeOrigin = (globalThis as unknown as { performance: { timeOrigin: number } })
      .performance.timeOrigin;
    expect(emitted?.t).toBe(PEAK_MS);
    // Before the clock syncs its offset is 0, so room time is the device's own epoch time.
    expect(emitted?.swing.peakAt).toBe(Math.round(timeOrigin + PEAK_MS));
  });
});
