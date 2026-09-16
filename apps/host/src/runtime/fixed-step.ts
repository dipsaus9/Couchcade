import { tickMs } from "@couchcade/game-sdk/contract";
import type { Scheduler } from "./timing.ts";

export interface FixedStepOptions {
  /** Local clock in milliseconds. */
  now(): number;
  /** Wakes the loop. It asks for the next wake-up one tick later and catches up on late ones. */
  schedule: Scheduler;
  /** One fixed step. Calling `stop()` inside it ends the loop at once. */
  onTick(): void;
  /**
   * Most ticks run in one wake-up. A tab the browser paused for longer loses the rest, so the game
   * slows down instead of running thousands of ticks at once. Defaults to 60 (one second).
   */
  maxTicksPerWake?: number;
}

export interface FixedStepLoop {
  readonly running: boolean;
  start(): void;
  stop(): void;
}

/**
 * A fixed 60 Hz timestep (docs/architecture/platform.md, "How the host runs a game", step 3). Wall
 * time piles up in an accumulator and every full `tickMs` in it runs one tick, so the number of
 * ticks follows elapsed time however late the timer fires.
 */
export function createFixedStepLoop(options: FixedStepOptions): FixedStepLoop {
  const maxTicks = options.maxTicksPerWake ?? 60;
  let running = false;
  let last = 0;
  let accumulated = 0;
  let cancel: (() => void) | null = null;

  const wake = (): void => {
    cancel = null;
    const now = options.now();
    accumulated += now - last;
    last = now;

    let ticks = 0;
    // A tiny epsilon keeps float sums of 1000 / 60 from skipping a tick.
    while (accumulated >= tickMs - 1e-6 && ticks < maxTicks) {
      accumulated -= tickMs;
      ticks += 1;
      options.onTick();
      if (!running) return;
    }
    if (ticks === maxTicks) accumulated = Math.min(accumulated, tickMs);
    cancel = options.schedule(wake, tickMs);
  };

  return {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      last = options.now();
      accumulated = 0;
      cancel = options.schedule(wake, tickMs);
    },
    stop() {
      running = false;
      cancel?.();
      cancel = null;
    },
  };
}
