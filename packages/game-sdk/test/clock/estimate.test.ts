import { describe, expect, it } from "vitest";
import { clockSampleOf, estimateClockOffset, minClockSamples } from "@couchcade/game-sdk/clock";
import type { ClockSample } from "@couchcade/game-sdk/clock";

const samplesOf = (
  pairs: ReadonlyArray<readonly [rttMs: number, offsetMs: number]>,
): ClockSample[] => pairs.map(([rttMs, offsetMs]) => ({ rttMs, offsetMs }));

describe("clockSampleOf", () => {
  it("takes the round trip and the offset at the midpoint", () => {
    expect(clockSampleOf(1_000, 5_060, 1_100)).toEqual({ rttMs: 100, offsetMs: 4_010 });
  });

  it("keeps a fractional local clock", () => {
    expect(clockSampleOf(1_000.25, 2_000, 1_040.75)).toEqual({ rttMs: 40.5, offsetMs: 979.5 });
  });
});

describe("estimateClockOffset", () => {
  it("needs at least 5 samples", () => {
    expect(minClockSamples).toBe(5);
    const four = samplesOf([
      [40, 10],
      [40, 10],
      [40, 10],
      [40, 10],
    ]);
    expect(estimateClockOffset(four)).toBeNull();
    expect(estimateClockOffset([...four, { rttMs: 40, offsetMs: 10 }])).toBe(10);
  });

  it("discards round trips above the median plus one standard deviation", () => {
    // Median round trip 176.5, standard deviation about 128: the four slow samples above 304.5 go.
    const samples = samplesOf([
      [50, 100],
      [51, 100],
      [52, 100],
      [53, 100],
      [300, 400],
      [310, 400],
      [320, 400],
      [330, 400],
    ]);
    const unfiltered = samples.map((s) => s.offsetMs).toSorted((a, b) => a - b);
    expect((unfiltered[3]! + unfiltered[4]!) / 2).toBe(250);
    expect(estimateClockOffset(samples)).toBe(100);
  });

  it("keeps a round trip exactly at the limit", () => {
    // All equal: the deviation is 0 and the limit is the median, so nothing is dropped.
    const samples = samplesOf([
      [60, 1],
      [60, 2],
      [60, 3],
      [60, 4],
      [60, 5],
    ]);
    expect(estimateClockOffset(samples)).toBe(3);
  });

  it("takes the median offset of what is left, averaging the middle two", () => {
    const samples = samplesOf([
      [40, 7],
      [40, 1],
      [40, 5],
      [40, 3],
      [40, 9],
      [40, 11],
    ]);
    expect(estimateClockOffset(samples)).toBe(6);
  });

  it("doesn't reorder the samples it is given", () => {
    const samples = samplesOf([
      [90, 3],
      [10, 1],
      [50, 2],
      [30, 5],
      [70, 4],
    ]);
    const before = structuredClone(samples);
    estimateClockOffset(samples);
    expect(samples).toEqual(before);
  });
});
