import { describe, expect, it } from "vitest";
import { linkClockSampleOf, linkOffsetToRoom } from "@couchcade/game-sdk/link";

describe("linkClockSampleOf", () => {
  it("returns an exact round trip and offset for a symmetric path", () => {
    // Phone 1,000 ms behind the host; 20 ms forward, 20 ms back.
    const sample = linkClockSampleOf({ t0: 0, t1: 1_020, t2: 1_020, t3: 40 });
    expect(sample.rttMs).toBe(40);
    expect(sample.offsetPHMs).toBe(1_000);
  });

  it("returns the round trip within 1 ms for asymmetric one-way delays", () => {
    // True phone-to-host offset 500 ms. Forward delay 30 ms, return delay 10 ms: asymmetric.
    const trueOffsetPHMs = 500;
    const forwardMs = 30;
    const returnMs = 10;
    const t0 = 10_000;
    const t1 = t0 + trueOffsetPHMs + forwardMs;
    const t2 = t1; // the host answers at once
    const t3 = t2 - trueOffsetPHMs + returnMs;

    const sample = linkClockSampleOf({ t0, t1, t2, t3 });
    expect(sample.rttMs).toBeCloseTo(forwardMs + returnMs, 3);
    // The estimate is off by half the asymmetry, exactly as the doc says.
    expect(sample.offsetPHMs).toBeCloseTo(trueOffsetPHMs + (forwardMs - returnMs) / 2, 3);
  });

  it("stays within 1 ms of hand-computed values across several asymmetric cases", () => {
    const cases = [
      { trueOffsetPHMs: -1_234.5, forwardMs: 15, returnMs: 45 },
      { trueOffsetPHMs: 0, forwardMs: 100, returnMs: 5 },
      { trueOffsetPHMs: 9_999, forwardMs: 3.25, returnMs: 3.25 },
    ];
    for (const { trueOffsetPHMs, forwardMs, returnMs } of cases) {
      const t0 = 1_000;
      const t1 = t0 + trueOffsetPHMs + forwardMs;
      const t2 = t1 + 2; // the host takes 2 ms to answer
      const t3 = t2 - trueOffsetPHMs + returnMs;

      const sample = linkClockSampleOf({ t0, t1, t2, t3 });
      // The 2 ms host processing gap cancels out of the round trip, as it should.
      expect(Math.abs(sample.rttMs - (forwardMs + returnMs))).toBeLessThan(1);
      expect(
        Math.abs(sample.offsetPHMs - (trueOffsetPHMs + (forwardMs - returnMs) / 2)),
      ).toBeLessThan(1);
    }
  });
});

describe("linkOffsetToRoom", () => {
  it("adds the host's own room clock offset", () => {
    expect(linkOffsetToRoom(500, -2_000)).toBe(-1_500);
    expect(linkOffsetToRoom(-42.5, 42.5)).toBe(0);
  });
});
