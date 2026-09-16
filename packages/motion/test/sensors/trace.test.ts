import { describe, expect, it } from "vitest";
import { synthetic, traceSamples } from "@couchcade/motion/sensors";
import type { Trace } from "@couchcade/motion/sensors";

describe("traceSamples", () => {
  it("turns version 1 rows into samples, keeping nulls and signs as recorded", () => {
    const trace: Pick<Trace, "v" | "samples"> = {
      v: 1,
      samples: [
        [0, 16.7, [0.01, -0.03, 0.12], [0.1, 6.2, 7.6], [1.2, -0.4, 0.3]],
        [16.7, 16.7, null, [0.1, -6.3, -7.5], null],
      ],
    };
    expect(traceSamples(trace)).toEqual([
      {
        t: 0,
        interval: 16.7,
        acceleration: { x: 0.01, y: -0.03, z: 0.12 },
        gravityAcceleration: { x: 0.1, y: 6.2, z: 7.6 },
        rotationRate: { alpha: 1.2, beta: -0.4, gamma: 0.3 },
      },
      {
        t: 16.7,
        interval: 16.7,
        acceleration: null,
        gravityAcceleration: { x: 0.1, y: -6.3, z: -7.5 },
        rotationRate: null,
      },
    ]);
  });

  it("rejects other versions", () => {
    expect(() => traceSamples({ v: 0 as 1, samples: [] })).toThrow(/version 0/);
  });
});

describe("synthetic", () => {
  it("still: a second of 60 Hz samples with no rotation and nothing expected to fire", () => {
    const trace = synthetic.still();
    const samples = traceSamples(trace);

    expect(trace).toMatchObject({ v: 1, gesture: "still", rawSigns: "w3c", expect: { events: 0 } });
    expect(samples).toHaveLength(61);
    expect(samples.at(-1)?.t).toBe(1000);
    expect(samples[1]?.interval).toBeCloseTo(16.667, 3);
    for (const sample of samples) {
      expect(sample.rotationRate).toEqual({ alpha: 0, beta: 0, gamma: 0 });
      expect(sample.gravityAcceleration?.y).toBeCloseTo(6.937, 3);
      expect(sample.gravityAcceleration?.z).toBeCloseTo(6.937, 3);
    }
  });

  it("swing: a half-sine pulse reaching the peak on the chosen axis, inside a held grip", () => {
    const trace = synthetic.swing({ peak: 800, axis: "gamma", durationMs: 300, paddingMs: 100 });
    const samples = traceSamples(trace);
    const gamma = samples.map((s) => s.rotationRate?.gamma ?? 0);
    const peakIndex = gamma.indexOf(Math.max(...gamma));

    expect(trace).toMatchObject({ gesture: "swing", expect: { events: 1 } });
    expect(trace.marks).toEqual([
      [0, "grip-down"],
      [500, "grip-up"],
    ]);
    expect(gamma[peakIndex]).toBeCloseTo(800, 0);
    expect(samples[peakIndex]?.t).toBeCloseTo(250, 0);
    expect(samples[0]?.rotationRate).toEqual({ alpha: 0, beta: 0, gamma: 0 });
    expect(samples.every((s) => s.rotationRate?.alpha === 0 && s.rotationRate.beta === 0)).toBe(
      true,
    );
  });

  it("inverted signs negate both acceleration fields only", () => {
    const w3c = traceSamples(synthetic.still({ gravity: [1, 2, 3] }));
    const inverted = synthetic.still({ gravity: [1, 2, 3], rawSigns: "inverted" });

    expect(inverted.rawSigns).toBe("inverted");
    expect(w3c[0]?.gravityAcceleration).toEqual({ x: 1, y: 2, z: 3 });
    expect(traceSamples(inverted)[0]?.gravityAcceleration).toEqual({ x: -1, y: -2, z: -3 });
  });

  it("drops the rotation rate for a phone without a gyroscope", () => {
    const samples = traceSamples(synthetic.swing({ gyroscope: false }));
    expect(samples.every((s) => s.rotationRate === null && s.gravityAcceleration !== null)).toBe(
      true,
    );
  });
});
