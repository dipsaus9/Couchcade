import { describe, expect, it } from "vitest";
import { createFixedStepLoop } from "../../src/runtime/fixed-step.ts";
import { createVirtualTime } from "./fixtures.ts";

function loopOn(time: ReturnType<typeof createVirtualTime>) {
  let ticks = 0;
  const loop = createFixedStepLoop({
    now: time.now,
    schedule: time.schedule,
    onTick: () => (ticks += 1),
  });
  return { loop, ticks: () => ticks };
}

describe("createFixedStepLoop", () => {
  it("runs 60 ticks per second of elapsed time", () => {
    const time = createVirtualTime(1000);
    const { loop, ticks } = loopOn(time);
    loop.start();
    // One extra millisecond, so float sums of 1000 / 60 land inside the second.
    time.advance(1001);
    expect(ticks()).toBe(60);
    time.advance(9000);
    expect(ticks()).toBe(600);
  });

  it("catches up when the timer fires late, so ticks follow wall time", () => {
    const time = createVirtualTime();
    let ticks = 0;
    const lateMs = 50;
    // A scheduler that fires 50 ms late every time, as a busy browser might.
    const loop = createFixedStepLoop({
      now: time.now,
      schedule: (callback, delayMs) => time.schedule(callback, delayMs + lateMs),
      onTick: () => (ticks += 1),
    });
    loop.start();
    time.advance(2000);
    // Each wake-up runs the 4 ticks that are due. It never runs ahead of wall time and lags by at
    // most one wake-up.
    expect(ticks).toBeGreaterThanOrEqual(116);
    expect(ticks).toBeLessThanOrEqual(120);
  });

  it("drops time beyond the catch-up cap instead of running a burst of ticks", () => {
    const time = createVirtualTime();
    let ticks = 0;
    const loop = createFixedStepLoop({
      now: time.now,
      // The tab was paused: the first wake-up comes 10 seconds late.
      schedule: (callback, delayMs) => time.schedule(callback, ticks === 0 ? 10_000 : delayMs),
      onTick: () => (ticks += 1),
      maxTicksPerWake: 30,
    });
    loop.start();
    time.advance(10_000);
    expect(ticks).toBe(30);
    time.advance(1000);
    expect(ticks).toBeLessThanOrEqual(30 + 61);
  });

  it("stops at once when a tick calls stop, and schedules nothing more", () => {
    const time = createVirtualTime();
    let ticks = 0;
    const loop = createFixedStepLoop({
      now: time.now,
      schedule: time.schedule,
      onTick: () => {
        ticks += 1;
        if (ticks === 3) loop.stop();
      },
    });
    loop.start();
    time.advance(5000);
    expect(ticks).toBe(3);
    expect(loop.running).toBe(false);
    expect(time.pending).toBe(0);
  });
});
