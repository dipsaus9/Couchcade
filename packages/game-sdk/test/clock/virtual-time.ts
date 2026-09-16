import type { ClockScheduler } from "@couchcade/game-sdk/clock";

interface Timer {
  at: number;
  order: number;
  run: () => void;
  cancelled: boolean;
}

/** Virtual milliseconds for tests: nothing runs until `advanceTo` moves time forward. */
export function createVirtualTime() {
  let now = 0;
  let order = 0;
  let timers: Timer[] = [];

  const at = (time: number, run: () => void): (() => void) => {
    const timer: Timer = { at: Math.max(time, now), order: order++, run, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };

  const schedule: ClockScheduler = (callback, delayMs) => at(now + delayMs, callback);

  return {
    get now() {
      return now;
    },
    schedule,
    /** Runs `run` at virtual time `time`, or now if that has passed. */
    at,
    /** Timers still waiting to run. */
    get pending() {
      return timers.filter((timer) => !timer.cancelled).length;
    },
    /** Runs every timer due up to `time`, in time order, then sets the clock to `time`. */
    advanceTo(time: number) {
      for (;;) {
        timers = timers.filter((timer) => !timer.cancelled);
        const next = timers
          .filter((timer) => timer.at <= time)
          .toSorted((a, b) => a.at - b.at || a.order - b.order)[0];
        if (next === undefined) break;
        timers = timers.filter((timer) => timer !== next);
        now = next.at;
        next.run();
      }
      now = time;
    },
    advanceBy(ms: number) {
      this.advanceTo(now + ms);
    },
  };
}
