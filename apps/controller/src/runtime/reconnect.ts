/**
 * What the phone does around a dropped socket (docs/architecture/session-flow.md, "Phone reconnect",
 * "On the phone", steps 1 and 2):
 *
 * 1. When the page becomes visible and the socket is closed, reconnect at once instead of waiting
 *    for partysocket's backoff. A locked screen is the most common drop.
 * 2. Show "Connection lost" only after 1 second without a socket, so a quick reconnect doesn't
 *    flash it. The last view stays underneath until then.
 *
 * The seat itself is kept by the relay for 2 minutes. The rejoin token in `sessionStorage` swaps for
 * a fresh ticket on every reconnect (session/socket.ts).
 */

/** How long the phone may be without a socket before it shows "Connection lost". */
export const lostScreenDelayMs = 1000;

/** The part of `Document` the watch needs, so tests can pass a plain object. */
export interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Runs `callback` after `delayMs` and returns a function that cancels it. */
export type Scheduler = (callback: () => void, delayMs: number) => () => void;

export interface ReconnectWatchOptions {
  /** True while the socket is closed, waiting for its next attempt. */
  isClosed(): boolean;
  /** Connects again right now, skipping any backoff. */
  reconnectNow(): void;
  /** The socket has been gone for `lostScreenDelayMs`. */
  onLostTooLong(): void;
  /** Defaults to the page's `document`, or none outside a browser. */
  visibility?: VisibilitySource | null;
  schedule?: Scheduler;
}

export interface ReconnectWatch {
  /** The socket closed and will reconnect. Starts the "Connection lost" delay. */
  lost(): void;
  /** The socket is open again. Cancels a pending "Connection lost". */
  opened(): void;
  /** Stops listening and cancels anything pending. */
  dispose(): void;
}

const scheduleTimeout: Scheduler = (callback, delayMs) => {
  const id = setTimeout(callback, delayMs);
  return () => clearTimeout(id);
};

export function watchReconnect({
  isClosed,
  reconnectNow,
  onLostTooLong,
  visibility = globalThis.document ?? null,
  schedule = scheduleTimeout,
}: ReconnectWatchOptions): ReconnectWatch {
  let cancelLost: (() => void) | null = null;

  const onVisibilityChange = (): void => {
    if (visibility?.visibilityState === "visible" && isClosed()) reconnectNow();
  };
  visibility?.addEventListener("visibilitychange", onVisibilityChange);

  const cancel = (): void => {
    cancelLost?.();
    cancelLost = null;
  };

  return {
    lost() {
      if (cancelLost !== null) return;
      cancelLost = schedule(() => {
        cancelLost = null;
        onLostTooLong();
      }, lostScreenDelayMs);
    },
    opened: cancel,
    dispose() {
      cancel();
      visibility?.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
