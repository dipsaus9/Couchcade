/** Virtual time for streams and senders: `now` and timers only move when a test advances them. */
export function virtualTime(start = 10_000) {
  let now = start;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    schedule: (callback: () => void, delayMs: number) => {
      const key = id++;
      timers.set(key, { at: now + delayMs, callback });
      return () => void timers.delete(key);
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers]
          .filter(([, t]) => t.at <= end)
          .toSorted((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = end;
    },
  };
}
