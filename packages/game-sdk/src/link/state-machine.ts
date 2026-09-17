/**
 * The link state machine, from docs/architecture/realtime-link.md, "Connection lifecycle" > "Link
 * states on the phone". Owns no socket and no `RTCPeerConnection`: the app calls its methods when
 * the browser wiring reports a lifecycle event, and reads `state` to decide which path real-time
 * input takes. Tests inject the clock and the scheduler, so they run on fake timers, the same
 * pattern as `clock/room-clock.ts`.
 *
 * ```ts
 * const link = createLinkStateMachine();
 * link.onChange((state) => { ... switch real-time input to the link or the relay ... });
 * link.start(); // seated, TV connected, socket open, switch on
 * // wiring: pc.createDataChannel(...); both open -> link.channelsOpen()
 * // wiring: link:pong arrives -> link.pong()
 * // wiring: pc.connectionState becomes "failed" or "closed" -> link.connectionClosed()
 * ```
 */

export type LinkState = "off" | "connecting" | "direct" | "stale" | "relay";

/** Runs `callback` once after `delayMs` and returns a function that cancels it. */
export type LinkScheduler = (callback: () => void, delayMs: number) => () => void;

export interface LinkStateMachineOptions {
  /**
   * The local clock in milliseconds, may be fractional. Defaults to
   * `performance.timeOrigin + performance.now()`, the same as `RoomClockOptions.now`.
   */
  now?: () => number;
  /** Defaults to `setTimeout` and `clearTimeout`. */
  schedule?: LinkScheduler;
  /**
   * The expected gap between `link:ping`s: 250 ms during `playing` in a real-time game, 1,000 ms
   * otherwise (Channels, messages and rates). The stale timeout is 3 of these, floored at 750 ms.
   * Default 250.
   */
  pingIntervalMs?: number;
}

export interface LinkStateMachine {
  readonly state: LinkState;
  /** Subscribes to every state change. Returns a function that unsubscribes. */
  onChange(listener: (state: LinkState) => void): () => void;
  /** off -> connecting: seated, TV connected, socket open, switch on. A no-op past the hourly budget. */
  start(): void;
  /** Both data channels are open. With 3 pongs, promotes `connecting` to `direct`. */
  channelsOpen(): void;
  /** One `link:pong` arrived. */
  pong(): void;
  /** The peer refused the rebuilt description: `connecting` -> `relay` at once, no 5 s wait. */
  descriptionRefused(): void;
  /** The connection failed or closed: -> `relay` from `connecting`, `direct` or `stale`. */
  connectionClosed(): void;
  /**
   * relay -> connecting: the retry timer, the page becoming visible, the socket or the TV coming
   * back, or a new game starting. A no-op outside `relay` or past the hourly budget.
   */
  retry(): void;
  /** -> off from any state: seat lost, TV away, socket closed for good, page hidden. */
  stop(): void;
  /** Changes the assumed gap between pings; applied to the stale timeout at once if `direct`. */
  setPingIntervalMs(pingIntervalMs: number): void;
}

/** connecting -> relay if no link comes up within this long. */
export const connectTimeoutMs = 5_000;
/** direct -> connecting needs this many pongs, alongside both channels open. */
export const promotePongs = 3;
/** The stale timeout is `promotePongs` ping intervals, floored at this. */
export const minStaleAfterMs = 750;
/** stale -> relay after this long with no pong. */
export const staleToRelayMs = 5_000;
/** Automatic retry backoff after a failed attempt, in order. After these, only a trigger retries. */
export const retryBackoffMs: readonly number[] = [10_000, 30_000, 90_000];
/** At most this many connection attempts (any trigger) in a rolling hour. */
export const maxAttemptsPerHour = 10;
export const attemptWindowMs = 60 * 60_000;

interface TimerGlobals {
  performance: { timeOrigin: number; now(): number };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

// The lib tsconfig has no DOM types. Browsers, Workers and Node all provide these.
const globals = globalThis as unknown as TimerGlobals;

const localNow = (): number => globals.performance.timeOrigin + globals.performance.now();

const scheduleTimeout: LinkScheduler = (callback, delayMs) => {
  const handle = globals.setTimeout(callback, delayMs);
  return () => globals.clearTimeout(handle);
};

export function createLinkStateMachine(options: LinkStateMachineOptions = {}): LinkStateMachine {
  const now = options.now ?? localNow;
  const schedule = options.schedule ?? scheduleTimeout;
  let pingIntervalMs = options.pingIntervalMs ?? 250;

  let state: LinkState = "off";
  let listeners: Array<(state: LinkState) => void> = [];
  let attempts: number[] = [];
  let backoffIndex = 0;
  let channelsReady = false;
  let pongCount = 0;

  let cancelConnectTimeout: (() => void) | null = null;
  let cancelStaleWatch: (() => void) | null = null;
  let cancelStaleToRelay: (() => void) | null = null;
  let cancelRetryTimer: (() => void) | null = null;

  const staleAfterMs = (): number => Math.max(promotePongs * pingIntervalMs, minStaleAfterMs);

  const clearAllTimers = (): void => {
    cancelConnectTimeout?.();
    cancelConnectTimeout = null;
    cancelStaleWatch?.();
    cancelStaleWatch = null;
    cancelStaleToRelay?.();
    cancelStaleToRelay = null;
    cancelRetryTimer?.();
    cancelRetryTimer = null;
  };

  const setState = (next: LinkState): void => {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener(state);
  };

  const withinBudget = (atMs: number): boolean => {
    attempts = attempts.filter((attemptAt) => attemptAt > atMs - attemptWindowMs);
    return attempts.length < maxAttemptsPerHour;
  };

  const armStaleWatch = (): void => {
    cancelStaleWatch?.();
    cancelStaleWatch = schedule(() => {
      cancelStaleWatch = null;
      enterStale();
    }, staleAfterMs());
  };

  function enterConnecting(): boolean {
    const atMs = now();
    if (!withinBudget(atMs)) return false;
    attempts.push(atMs);
    channelsReady = false;
    pongCount = 0;
    clearAllTimers();
    setState("connecting");
    cancelConnectTimeout = schedule(() => {
      cancelConnectTimeout = null;
      enterRelay();
    }, connectTimeoutMs);
    return true;
  }

  function maybePromote(): void {
    if (state !== "connecting" || !channelsReady || pongCount < promotePongs) return;
    cancelConnectTimeout?.();
    cancelConnectTimeout = null;
    backoffIndex = 0;
    setState("direct");
    armStaleWatch();
  }

  function enterStale(): void {
    if (state !== "direct") return;
    setState("stale");
    cancelStaleToRelay?.();
    cancelStaleToRelay = schedule(() => {
      cancelStaleToRelay = null;
      enterRelay();
    }, staleToRelayMs);
  }

  function enterRelay(): void {
    clearAllTimers();
    setState("relay");
    if (backoffIndex < retryBackoffMs.length) {
      const delay = retryBackoffMs[backoffIndex] as number;
      backoffIndex += 1;
      cancelRetryTimer = schedule(() => {
        cancelRetryTimer = null;
        enterConnecting();
      }, delay);
    }
  }

  return {
    get state() {
      return state;
    },

    onChange(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((existing) => existing !== listener);
      };
    },

    start() {
      if (state !== "off") return;
      enterConnecting();
    },

    channelsOpen() {
      if (state !== "connecting") return;
      channelsReady = true;
      maybePromote();
    },

    pong() {
      if (state === "connecting") {
        pongCount += 1;
        maybePromote();
      } else if (state === "direct") {
        armStaleWatch();
      } else if (state === "stale") {
        cancelStaleToRelay?.();
        cancelStaleToRelay = null;
        setState("direct");
        armStaleWatch();
      }
    },

    descriptionRefused() {
      if (state !== "connecting") return;
      enterRelay();
    },

    connectionClosed() {
      if (state === "connecting" || state === "direct" || state === "stale") enterRelay();
    },

    retry() {
      if (state !== "relay") return;
      cancelRetryTimer?.();
      cancelRetryTimer = null;
      enterConnecting();
    },

    stop() {
      clearAllTimers();
      channelsReady = false;
      pongCount = 0;
      setState("off");
    },

    setPingIntervalMs(next) {
      pingIntervalMs = next;
      if (state === "direct") armStaleWatch();
    },
  };
}
