import { describe, expect, it, vi } from "vitest";
import { watchConnectionDelay, type Scheduler } from "../../src/errors/connection-delay.ts";

function fakeScheduler(): { schedule: Scheduler; flush(): void; pending(): number } {
  const pending = new Set<() => void>();
  const schedule: Scheduler = (callback) => {
    pending.add(callback);
    return () => pending.delete(callback);
  };
  return {
    schedule,
    flush: () => {
      const callbacks = [...pending];
      pending.clear();
      callbacks.forEach((callback) => callback());
    },
    pending: () => pending.size,
  };
}

describe("watchConnectionDelay", () => {
  it("fires onLostTooLong only once the delay elapses", () => {
    const { schedule, flush } = fakeScheduler();
    const onLostTooLong = vi.fn<() => void>();
    const watch = watchConnectionDelay(onLostTooLong, schedule);

    watch.lost();
    expect(onLostTooLong).not.toHaveBeenCalled();
    flush();
    expect(onLostTooLong).toHaveBeenCalledOnce();
  });

  it("cancels the delay when restored before it fires", () => {
    const { schedule, flush, pending } = fakeScheduler();
    const onLostTooLong = vi.fn<() => void>();
    const watch = watchConnectionDelay(onLostTooLong, schedule);

    watch.lost();
    watch.restored();
    expect(pending()).toBe(0);
    flush();
    expect(onLostTooLong).not.toHaveBeenCalled();
  });

  it("doesn't schedule a second delay while one is already pending", () => {
    const { schedule, pending } = fakeScheduler();
    const watch = watchConnectionDelay(vi.fn<() => void>(), schedule);

    watch.lost();
    watch.lost();
    expect(pending()).toBe(1);
  });

  it("cancels a pending delay on dispose", () => {
    const { schedule, flush, pending } = fakeScheduler();
    const onLostTooLong = vi.fn<() => void>();
    const watch = watchConnectionDelay(onLostTooLong, schedule);

    watch.lost();
    watch.dispose();
    expect(pending()).toBe(0);
    flush();
    expect(onLostTooLong).not.toHaveBeenCalled();
  });
});
