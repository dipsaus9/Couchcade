import { describe, expect, it } from "vitest";
import {
  createLinkGuard,
  createTokenBucket,
  cutoffDropThreshold,
  cutoffWindowMs,
  eventsBurst,
  eventsRatePerSecond,
  streamBurst,
  streamRatePerSecond,
} from "@couchcade/game-sdk/link";

describe("createTokenBucket", () => {
  it("allows a burst of frames at once, then drops until it refills", () => {
    const bucket = createTokenBucket({ ratePerSecond: 10, burst: 4 });
    expect([0, 1, 2, 3].map(() => bucket.take(0))).toEqual([true, true, true, true]);
    expect(bucket.take(0)).toBe(false);
  });

  it("refills from elapsed time, not a timer", () => {
    const bucket = createTokenBucket({ ratePerSecond: 10, burst: 1 });
    expect(bucket.take(0)).toBe(true);
    expect(bucket.take(50)).toBe(false); // 0.5 tokens back, not enough for 1
    expect(bucket.take(100)).toBe(true); // 1 full token back after 100 ms at 10/s
  });

  it("never holds more than burst tokens even after a long gap", () => {
    const bucket = createTokenBucket({ ratePerSecond: 5, burst: 2 });
    expect(bucket.take(0)).toBe(true);
    expect(bucket.take(0)).toBe(true);
    expect(bucket.take(0)).toBe(false);
    bucket.take(1_000_000); // ages the bucket by a long time, still caps at burst
    expect(bucket.take(1_000_000)).toBe(true);
    expect(bucket.take(1_000_000)).toBe(false);
  });
});

describe("createLinkGuard", () => {
  it("matches the documented cc-stream and cc-events rates", () => {
    expect([streamRatePerSecond, streamBurst]).toEqual([130, 40]);
    expect([eventsRatePerSecond, eventsBurst]).toEqual([20, 20]);
  });

  it("drops cc-stream frames past 130/s burst 40", () => {
    const guard = createLinkGuard();
    const admitted = Array.from({ length: 200 }, () => guard.admit("stream", 0));
    expect(admitted.filter(Boolean)).toHaveLength(streamBurst);
    expect(admitted.filter((a) => !a)).toHaveLength(200 - streamBurst);
  });

  it("drops cc-events frames past 20/s burst 20, independently of cc-stream", () => {
    const guard = createLinkGuard();
    for (let i = 0; i < eventsBurst; i++) expect(guard.admit("events", 0)).toBe(true);
    expect(guard.admit("events", 0)).toBe(false);
    // The stream bucket is untouched by the events flood.
    expect(guard.admit("stream", 0)).toBe(true);
  });

  it("reports cut off once more than 100 frames were dropped within 10 s", () => {
    const guard = createLinkGuard();
    for (let i = 0; i < streamBurst; i++) guard.admit("stream", 0); // drains the burst
    // Every further admit at the same instant sees no elapsed time, so no refill: a guaranteed drop.
    for (let i = 0; i < cutoffDropThreshold; i++) expect(guard.admit("stream", 0)).toBe(false);
    expect(guard.cutOff).toBe(false); // exactly the threshold, not past it

    expect(guard.admit("stream", 0)).toBe(false); // the 101st drop
    expect(guard.cutOff).toBe(true);
  });

  it("forgets drops once they age out of the 10 s window", () => {
    const guard = createLinkGuard();
    for (let i = 0; i < streamBurst; i++) guard.admit("stream", 0);
    for (let i = 0; i <= cutoffDropThreshold; i++) guard.admit("stream", 0); // 101 drops at t = 0
    expect(guard.cutOff).toBe(true);

    // Long enough later that the bucket is fully refilled and the old drops are past the window.
    const later = cutoffWindowMs + 1;
    for (let i = 0; i < streamBurst; i++) expect(guard.admit("stream", later)).toBe(true);
    expect(guard.admit("stream", later)).toBe(false); // one fresh drop
    expect(guard.cutOff).toBe(false);
  });
});
