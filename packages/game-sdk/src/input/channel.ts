/**
 * `createInputChannel`, the implementation behind `InputChannel` (`../contract/index.ts`), from
 * docs/architecture/realtime-link.md, "Game SDK API sketch": one capability every controller uses
 * for real-time input, so a game never knows whether the direct WebRTC link or the relay path
 * carried a message (owner decision 10).
 *
 * This file is DOM-free and owns no socket, no `RTCPeerConnection` and no link state machine: the
 * caller (the browser wiring, `apps/controller/src/runtime/link.ts`, CC-3.19) reports the current
 * path and supplies four send hooks, one per path and per kind of input. That keeps it pure and
 * testable with `createFakeLink` (`@couchcade/game-sdk/testing`) and plain mock functions, the
 * same pattern `createInputStream` uses for the relay-only path today.
 *
 * - **stream** (a continuous value, "latest wins"): direct sends each type at its own hz, dropping
 *   a call that repeats the last value sent or arrives before that type's next slot -- no queueing,
 *   the next reading covers it (realtime-link.md, "Rates"). Relay packs the newest value plus up
 *   to `INPUT_CHANNEL_MAX_MORE` earlier ones since the last relay send for that type into `more`,
 *   sharing the phone's 4-per-second, 250 ms cap with `fire` ("Smoothing on the relay path").
 * - **fire** (a discrete event, must arrive once): direct sends at once on the reliable channel.
 *   Relay shares the same paced queue as stream sends, events first. Every fired event gets one id
 *   that counts up for the channel's lifetime and travels on whichever path carries it, so the
 *   host's event de-duplication (`../link/dedupe.ts`) applies it once. Switching from direct to
 *   relay resends whatever fired in the last `INPUT_CHANNEL_RESEND_WINDOW_MS`, at most
 *   `INPUT_CHANNEL_MAX_RESEND`, with that same id ("Switching without losing a shot").
 *
 * ```ts
 * const channel = createInputChannel<GameInput>({
 *   streams: controller.streams,
 *   path: () => (link.state === "direct" ? "direct" : link.state === "off" ? "off" : "relay"),
 *   onPathChange: (listener) => link.onChange((s) => listener(toChannelPath(s))),
 *   sendRelayStream: (input, atMs, more) => relaySend({ ...input, more }, atMs),
 *   sendRelayEvent: (input, atMs, e) => relaySend({ ...input, e }, atMs),
 *   sendDirectStream: (input, atMs, n) => streamChannel.send(encode({ ...input, n }, atMs)),
 *   sendDirectEvent: (input, atMs, e) => eventsChannel.send(encode({ ...input, e }, atMs)),
 * });
 * channel.stream({ type: "aim", payload: { yaw, pitch } }, reading.t);
 * channel.fire({ type: "shoot", payload: { aim: channel.last("aim")?.payload } }, event.timeStamp);
 * ```
 */
import type { JsonValue } from "@couchcade/protocol";
import type { ClockScheduler } from "../clock/index.ts";
import type { GameInput, InputChannel, InputChannelPath } from "../contract/index.ts";
import { PHONE_INPUT_MIN_GAP_MS } from "./rates.ts";
import { INPUT_STREAM_MAX_QUEUE, jsonEqual } from "./stream.ts";

/** One packed relay sample, oldest first: ms before the message's own timestamp, and its payload. */
export type InputMoreEntry = readonly [dtMs: number, payload: JsonValue | undefined];

/** Most earlier samples one relay message packs alongside its newest value (protocol's `more` cap). */
export const INPUT_CHANNEL_MAX_MORE = 7;

/** How long a fired event is kept so a direct -> relay switch can resend it. */
export const INPUT_CHANNEL_RESEND_WINDOW_MS = 500;
/** Most events a direct -> relay switch resends. */
export const INPUT_CHANNEL_MAX_RESEND = 4;

/** Sends one continuous value on the relay path, newest as `input`, earlier ones as `more`. */
export type InputChannelStreamSend<TInput extends GameInput> = (
  input: TInput,
  atMs: number,
  more: readonly InputMoreEntry[],
) => unknown;

/**
 * Sends one input tagged with a counter: `n` for a direct-path stream sample (counts up per link,
 * see `../link/index.ts`'s clock and dedupe pieces) or `e` for an event on either path (counts up
 * per phone per page load, the same value on both paths).
 */
export type InputChannelCountedSend<TInput extends GameInput> = (
  input: TInput,
  atMs: number,
  n: number,
) => unknown;

export interface InputChannelOptions<TInput extends GameInput> {
  /** The controller's `streams` map (`CouchcadeController.streams`). Missing types default to 30. */
  streams?: Readonly<Record<string, { hz?: 30 | 60 }>>;
  /** The link path right now. Read live; a link state machine owns it, this channel never sets it. */
  path(): InputChannelPath;
  /** Subscribes to path changes. Returns an unsubscribe function, never called by the channel. */
  onPathChange(listener: (path: InputChannelPath) => void): () => void;
  /** Direct path, `cc-stream`: one continuous value at the type's own hz. */
  sendDirectStream: InputChannelCountedSend<TInput>;
  /** Direct path, `cc-events`: one event, at once. */
  sendDirectEvent: InputChannelCountedSend<TInput>;
  /** Relay path: one continuous value, packed with its recent history. */
  sendRelayStream: InputChannelStreamSend<TInput>;
  /** Relay path: one event, paced like a stream send. */
  sendRelayEvent: InputChannelCountedSend<TInput>;
  /** Most events queued for the relay path before the newest is dropped. Defaults to 8. */
  maxRelayQueue?: number;
  /** Local clock in milliseconds. Defaults to `performance.now()`. */
  now?: () => number;
  /** Defaults to `setTimeout` and `clearTimeout`. */
  schedule?: ClockScheduler;
  /** Dev warnings, such as a dropped event. Defaults to `console.warn`. */
  warn?: (message: string) => void;
}

interface RelaySample {
  atMs: number;
  payload: JsonValue | undefined;
}

interface RelayEvent<TInput extends GameInput> {
  input: TInput;
  atMs: number;
  eventId: number;
}

interface FiredEvent<TInput extends GameInput> extends RelayEvent<TInput> {
  /** Local time the event was fired, for the 500 ms resend window. */
  firedAtMs: number;
}

interface TimerGlobals {
  performance: { now(): number };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  console: { warn(message: string): void };
}

// The lib tsconfig has no DOM types. Browsers, Workers and Node all provide these.
const globals = globalThis as unknown as TimerGlobals;

const scheduleTimeout: ClockScheduler = (callback, delayMs) => {
  const handle = globals.setTimeout(callback, delayMs);
  return () => globals.clearTimeout(handle);
};

/** Builds one controller's `InputChannel`, from the transport hooks it is given. */
export function createInputChannel<TInput extends GameInput>(
  options: InputChannelOptions<TInput>,
): InputChannel<TInput> {
  const streams = options.streams;
  const maxRelayQueue = options.maxRelayQueue ?? INPUT_STREAM_MAX_QUEUE;
  const now = options.now ?? (() => globals.performance.now());
  const schedule = options.schedule ?? scheduleTimeout;
  const warn = options.warn ?? ((message: string) => globals.console.warn(message));

  const hzOf = (type: string): 30 | 60 => streams?.[type]?.hz ?? 30;

  // `last()`: the newest value given to `stream`, updated on every call regardless of pacing.
  const lastStreamValue = new Map<string, TInput>();

  // Direct path: per-type dedupe and hz gate. `directN` counts every direct stream send on this
  // link, reset when a fresh link becomes direct (`../link/state-machine.ts`'s `direct` state).
  const directLastSent = new Map<string, { payload: JsonValue | undefined; sentAtMs: number }>();
  let directN = 0;

  // Relay path: samples buffered per type since that type's last relay send, and the FIFO of
  // types and events waiting for the shared 4-per-second slot. Events go first, oldest first.
  const relayBuffers = new Map<string, RelaySample[]>();
  const relayLatestInput = new Map<string, TInput>();
  const relayPendingTypes: string[] = [];
  const relayEventQueue: Array<RelayEvent<TInput>> = [];
  let relayLastSendAtMs = Number.NEGATIVE_INFINITY;
  let cancelRelayTimer: (() => void) | null = null;

  // Every fired event, trimmed to the resend window, so a direct -> relay switch can replay it.
  let firedEvents: Array<FiredEvent<TInput>> = [];
  let nextEventId = 0;

  const trimFiredEvents = (): void => {
    const cutoff = now() - INPUT_CHANNEL_RESEND_WINDOW_MS;
    firedEvents = firedEvents.filter((event) => event.firedAtMs >= cutoff);
  };

  const relayHasPending = (): boolean => relayEventQueue.length > 0 || relayPendingTypes.length > 0;

  const flushRelayType = (type: string): void => {
    const buffer = relayBuffers.get(type);
    const input = relayLatestInput.get(type);
    relayBuffers.delete(type);
    relayLatestInput.delete(type);
    if (buffer === undefined || input === undefined || buffer.length === 0) return;
    const newest = buffer[buffer.length - 1] as RelaySample;
    const more: InputMoreEntry[] = buffer
      .slice(0, -1)
      .map((sample) => [newest.atMs - sample.atMs, sample.payload] as InputMoreEntry);
    options.sendRelayStream(input, newest.atMs, more);
  };

  const pumpRelay = (): void => {
    if (cancelRelayTimer !== null || !relayHasPending()) return;
    const waitMs = relayLastSendAtMs + PHONE_INPUT_MIN_GAP_MS - now();
    if (waitMs > 0) {
      cancelRelayTimer = schedule(() => {
        cancelRelayTimer = null;
        pumpRelay();
      }, waitMs);
      return;
    }
    const event = relayEventQueue.shift();
    if (event !== undefined) {
      options.sendRelayEvent(event.input, event.atMs, event.eventId);
      relayLastSendAtMs = now();
      pumpRelay();
      return;
    }
    const type = relayPendingTypes.shift();
    if (type !== undefined) {
      flushRelayType(type);
      relayLastSendAtMs = now();
      pumpRelay();
    }
  };

  const enqueueRelayEvent = (event: RelayEvent<TInput>): void => {
    if (relayEventQueue.length >= maxRelayQueue) {
      warn(
        `Input "${event.input.type}" dropped: ${maxRelayQueue} events are already waiting to send`,
      );
      return;
    }
    relayEventQueue.push(event);
    pumpRelay();
  };

  const resendRecentEvents = (): void => {
    trimFiredEvents();
    // Newest-first would favour the latest shot over the caller's own send order; keep the last
    // `INPUT_CHANNEL_MAX_RESEND` in the order they fired, oldest of those first.
    for (const event of firedEvents.slice(-INPUT_CHANNEL_MAX_RESEND)) {
      enqueueRelayEvent({ input: event.input, atMs: event.atMs, eventId: event.eventId });
    }
  };

  let previousPath = options.path();
  options.onPathChange((nextPath) => {
    if (previousPath === "direct" && nextPath !== "direct") resendRecentEvents();
    if (nextPath === "direct" && previousPath !== "direct") directN = 0;
    previousPath = nextPath;
  });

  return {
    stream(input, eventTimeStamp) {
      lastStreamValue.set(input.type, input);
      const path = options.path();
      if (path === "off") return;
      const atMs = eventTimeStamp ?? now();

      if (path === "direct") {
        const last = directLastSent.get(input.type);
        if (last !== undefined && jsonEqual(last.payload, input.payload)) return;
        const minGapMs = 1000 / hzOf(input.type);
        if (last !== undefined && now() - last.sentAtMs < minGapMs) return;
        directN += 1;
        options.sendDirectStream(input, atMs, directN);
        directLastSent.set(input.type, { payload: input.payload, sentAtMs: now() });
        return;
      }

      const buffer = relayBuffers.get(input.type) ?? [];
      relayBuffers.set(
        input.type,
        [...buffer, { atMs, payload: input.payload }].slice(-(INPUT_CHANNEL_MAX_MORE + 1)),
      );
      relayLatestInput.set(input.type, input);
      if (!relayPendingTypes.includes(input.type)) relayPendingTypes.push(input.type);
      pumpRelay();
    },

    fire(input, eventTimeStamp) {
      const atMs = eventTimeStamp ?? now();
      const eventId = nextEventId;
      nextEventId += 1;
      trimFiredEvents();
      firedEvents.push({ input, atMs, eventId, firedAtMs: now() });

      const path = options.path();
      if (path === "off") return;
      if (path === "direct") {
        options.sendDirectEvent(input, atMs, eventId);
        return;
      }
      enqueueRelayEvent({ input, atMs, eventId });
    },

    last(type) {
      const value = lastStreamValue.get(type);
      return (value ?? null) as Extract<TInput, { type: typeof type }> | null;
    },

    clear() {
      cancelRelayTimer?.();
      cancelRelayTimer = null;
      relayEventQueue.length = 0;
      relayPendingTypes.length = 0;
      relayBuffers.clear();
      relayLatestInput.clear();
      directLastSent.clear();
      firedEvents = [];
    },

    get path() {
      return options.path();
    },
  };
}
