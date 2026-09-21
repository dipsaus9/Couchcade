/**
 * The TV's own "Connection lost" badge (errors/ConnectionBadge.vue), shown only after the relay
 * socket has been away for a beat -- the same 1-second delay the phone uses before showing its own
 * "Connection lost" screen (apps/controller/src/runtime/reconnect.ts's `lostScreenDelayMs`), so a
 * quick reconnect doesn't flash it.
 */

/** How long the connection may be away before the badge shows. */
export const lostBadgeDelayMs = 1000;

/** Runs `callback` after `delayMs` and returns a function that cancels it. */
export type Scheduler = (callback: () => void, delayMs: number) => () => void;

const scheduleTimeout: Scheduler = (callback, delayMs) => {
  const id = setTimeout(callback, delayMs);
  return () => clearTimeout(id);
};

export interface ConnectionDelayWatch {
  /** The connection dropped. Starts the delay before `onLostTooLong` fires. */
  lost(): void;
  /** The connection is back (or the phase stopped tracking one). Cancels a pending delay. */
  restored(): void;
  dispose(): void;
}

export function watchConnectionDelay(
  onLostTooLong: () => void,
  schedule: Scheduler = scheduleTimeout,
): ConnectionDelayWatch {
  let cancel: (() => void) | null = null;

  const clear = (): void => {
    cancel?.();
    cancel = null;
  };

  return {
    lost() {
      if (cancel !== null) return;
      cancel = schedule(() => {
        cancel = null;
        onLostTooLong();
      }, lostBadgeDelayMs);
    },
    restored: clear,
    dispose: clear,
  };
}
