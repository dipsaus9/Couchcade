/**
 * The room clock from docs/architecture/platform.md, "Clock sync". Every device, the host included,
 * syncs to the Room Durable Object's clock by sending `clock:ping` and reading `clock:pong`.
 *
 * The clock owns no socket and no timer. The app passes a `send` function on every connect, feeds
 * it each `clock:pong`, and tells it when the socket closes. Tests inject the local clock and the
 * scheduler, so they run on virtual time.
 *
 * While a phone's WebRTC link is `direct`, it already has a link-derived room offset from
 * `link:ping`/`link:pong` (docs/architecture/realtime-link.md, "Refining a phone's clock over the
 * link"), fed in through `setLinkOffset`. `toHostTime` prefers that offset, and the periodic
 * resync `clock:ping` this module would otherwise send every 30 s pauses -- the burst of 5 on
 * connect still happens either way, so a phone always has room time before its link comes up.
 *
 * ```ts
 * socket.on("room:welcome", () => roomClock.connect((d) => socket.send(encode({ t: "clock:ping", d }))));
 * socket.on("clock:pong", (d) => roomClock.receive(d));
 * socket.on("close", () => roomClock.disconnect());
 * ```
 */
import type { PayloadOf } from "@couchcade/protocol";
import { clockSampleOf, estimateClockOffset } from "./estimate.ts";
import type { ClockSample } from "./estimate.ts";

export type ClockPing = PayloadOf<"clock:ping">;
export type ClockPong = PayloadOf<"clock:pong">;

/** Samples taken right after every connect and reconnect. */
export const clockBurstSamples = 5;
/** Gap between the samples of a burst. */
export const clockBurstGapMs = 200;
/** Gap between resync samples once connected. */
export const clockResyncMs = 30_000;
/** The estimate uses the last this many samples. */
export const clockWindowSamples = 8;

/** Runs `callback` once after `delayMs` and returns a function that cancels it. */
export type ClockScheduler = (callback: () => void, delayMs: number) => () => void;

export interface RoomClockOptions {
  /**
   * The local clock in milliseconds, may be fractional. Defaults to
   * `performance.timeOrigin + performance.now()`, which is monotonic and Unix epoch based.
   */
  now?: () => number;
  /** Defaults to `setTimeout` and `clearTimeout`. */
  schedule?: ClockScheduler;
}

export interface RoomClock {
  /** Room time minus local time, or `null` before the first estimate. */
  readonly offsetMs: number | null;
  /** True once this connection has an estimate from at least 5 samples. */
  readonly synced: boolean;
  /** Round trip of the latest sample, for the dev overlay. `null` before the first pong. */
  readonly lastRttMs: number | null;
  /**
   * Starts syncing over a new socket: 5 samples 200 ms apart, then 1 every 30 seconds. Call it
   * after every `room:welcome`. A reconnect clears the samples and syncs again, because the new
   * path can be slower one way than the old one. The last offset stays in use until then.
   */
  connect(send: (ping: ClockPing) => void): void;
  /** Stops sampling and forgets unanswered pings. Call it when the socket closes. */
  disconnect(): void;
  /** Feeds one `clock:pong`. Pongs this connection didn't ask for are ignored. */
  receive(pong: ClockPong): void;
  /** Resolves once this connection is synced. Timing controllers and the host wait for it. */
  whenSynced(): Promise<void>;
  /**
   * Converts a local timestamp to room time, as an integer. See the exported `toHostTime`.
   */
  toHostTime(localTimestamp: number): number;
  /**
   * Feeds the link-derived phone-to-room offset while the phone's WebRTC link is `direct`
   * (docs/architecture/realtime-link.md, "Refining a phone's clock over the link"): `toHostTime`
   * prefers it over the relay-derived `offsetMs`, and the periodic resync `clock:ping` (every
   * `clockResyncMs`) is skipped while it is set. The burst of `clockBurstSamples` on connect is
   * unaffected. Pass `null` when the link leaves `direct` (stale or relay): the next relay sample
   * goes at once, and the 30 s rhythm resumes from that moment.
   */
  setLinkOffset(linkOffsetMs: number | null): void;
}

interface TimerGlobals {
  performance: { timeOrigin: number; now(): number };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

// The lib tsconfig has no DOM types. Browsers, Workers and Node all provide these.
const globals = globalThis as unknown as TimerGlobals;

const localNow = (): number => globals.performance.timeOrigin + globals.performance.now();

const scheduleTimeout: ClockScheduler = (callback, delayMs) => {
  const handle = globals.setTimeout(callback, delayMs);
  return () => globals.clearTimeout(handle);
};

export function createRoomClock(options: RoomClockOptions = {}): RoomClock {
  const now = options.now ?? localNow;
  const schedule = options.schedule ?? scheduleTimeout;

  let offsetMs: number | null = null;
  let synced = false;
  let lastRttMs: number | null = null;
  let nextId = 0;
  let samples: ClockSample[] = [];
  let waiters: Array<() => void> = [];
  // Ping id to local send time, for this connection only.
  const pending = new Map<number, number>();
  const cancels = new Set<() => void>();

  // Set by `connect`, cleared by `disconnect`: the current connection's send, so `setLinkOffset`
  // can act on it (send a relay sample at once) without connect/disconnect owning that closure.
  let currentSend: ((ping: ClockPing) => void) | null = null;
  // The link-derived room offset while the link is `direct`, `null` on the relay/stale path.
  let linkOffsetMs: number | null = null;
  let resyncCancel: (() => void) | null = null;

  const after = (delayMs: number, callback: () => void): (() => void) => {
    const cancel = schedule(() => {
      cancels.delete(cancel);
      callback();
    }, delayMs);
    cancels.add(cancel);
    return cancel;
  };

  const sendPing = (): void => {
    if (currentSend === null) return;
    const id = nextId++;
    const t0 = now();
    pending.set(id, t0);
    currentSend({ id, t0 });
  };

  // Ticks every `clockResyncMs` for as long as the connection lives. While the link is direct
  // (`linkOffsetMs` set) the tick is skipped -- AC1's "no periodic clock:ping reaches the room" --
  // but the cadence itself keeps running so a later stale/relay switch resumes it without a gap
  // longer than one tick (`setLinkOffset` restarts it "at once" instead, for AC2).
  const armResync = (): void => {
    resyncCancel = after(clockResyncMs, () => {
      resyncCancel = null;
      if (linkOffsetMs === null) sendPing();
      armResync();
    });
  };

  const cancelResync = (): void => {
    if (resyncCancel === null) return;
    resyncCancel();
    cancels.delete(resyncCancel);
    resyncCancel = null;
  };

  const disconnect = (): void => {
    for (const cancel of cancels) cancel();
    cancels.clear();
    pending.clear();
    currentSend = null;
    resyncCancel = null;
    linkOffsetMs = null;
  };

  return {
    get offsetMs() {
      return offsetMs;
    },
    get synced() {
      return synced;
    },
    get lastRttMs() {
      return lastRttMs;
    },

    connect(send) {
      disconnect();
      samples = [];
      synced = false;
      currentSend = send;

      sendPing();
      for (let sample = 1; sample < clockBurstSamples; sample++) {
        after(sample * clockBurstGapMs, sendPing);
      }
      armResync();
    },

    disconnect,

    receive(pong) {
      const t3 = now();
      const t0 = pending.get(pong.id);
      if (t0 === undefined || t0 !== pong.t0) return;

      // Pongs come back in order on one socket, so older unanswered pings are lost for good.
      for (const id of pending.keys()) {
        if (id <= pong.id) pending.delete(id);
      }

      const sample = clockSampleOf(t0, pong.t1, t3);
      lastRttMs = sample.rttMs;
      samples = [...samples, sample].slice(-clockWindowSamples);

      const estimate = estimateClockOffset(samples);
      if (estimate === null) return;
      offsetMs = estimate;
      if (!synced) {
        synced = true;
        const resolved = waiters;
        waiters = [];
        for (const resolve of resolved) resolve();
      }
    },

    whenSynced() {
      if (synced) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },

    toHostTime(localTimestamp) {
      return Math.round(localTimestamp + (linkOffsetMs ?? offsetMs ?? 0));
    },

    setLinkOffset(next) {
      const wasDirect = linkOffsetMs !== null;
      linkOffsetMs = next;
      if (wasDirect && next === null && currentSend !== null) {
        // Leaving direct (AC2): don't wait for whatever's left of the paused cadence, sample now
        // and restart the 30 s rhythm from this moment.
        cancelResync();
        sendPing();
        armResync();
      }
    },
  };
}

/** The clock the host app and the phone app each connect to their room. */
export const roomClock: RoomClock = createRoomClock();

/**
 * Converts a local timestamp to room time on `roomClock`: `localTimestamp + offset`, rounded to an
 * integer, because `at` and every other time in a message must be whole milliseconds.
 *
 * `localTimestamp` is on the clock's local timeline, `performance.timeOrigin + performance.now()`.
 * An event's `timeStamp` counts from `performance.timeOrigin`, so pass
 * `performance.timeOrigin + event.timeStamp`.
 *
 * Before the first estimate the offset is 0, which is the device's own epoch time. Code that
 * judges timing waits for `roomClock.whenSynced()` first.
 */
export function toHostTime(localTimestamp: number): number {
  return roomClock.toHostTime(localTimestamp);
}

/**
 * Feeds `roomClock.setLinkOffset` (see `RoomClock.setLinkOffset`). The controller runtime's link
 * calls this with its own link-derived phone-to-room offset while direct, and `null` once it
 * leaves direct (docs/architecture/realtime-link.md, "Refining a phone's clock over the link").
 */
export function setLinkOffset(linkOffsetMs: number | null): void {
  roomClock.setLinkOffset(linkOffsetMs);
}
