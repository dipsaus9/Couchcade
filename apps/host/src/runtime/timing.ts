import type { ClockScheduler } from "@couchcade/game-sdk/clock";

/** Runs `callback` once after `delayMs` and returns a function that cancels it. */
export type Scheduler = ClockScheduler;

/** The local clock the runtime uses: monotonic milliseconds, on the room clock's local timeline. */
export const localNow = (): number => performance.timeOrigin + performance.now();

export const scheduleTimeout: Scheduler = (callback, delayMs) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/** Dev-only warnings. Production builds stay silent, so nothing is logged per message. */
export const devWarn = (message: string): void => {
  if (import.meta.env.DEV) console.warn(`[runtime] ${message}`);
};
