/**
 * The input stream from docs/architecture/session-flow.md, "Real-time input batching", and
 * docs/architecture/platform.md budget rule 4. Every phone input goes through one, so a phone sends
 * at most 4 messages per second, at least 250 ms apart, and only values that changed.
 *
 * ```ts
 * const stream = createInputStream(send); // CC-1.16's send helper stamps `at`
 * stream.set({ type: "tilt", payload: { x, y } }, event.timeStamp); // continuous: latest wins
 * stream.fire({ type: "dash", payload: {} }, event.timeStamp);      // discrete: queued, goes first
 * ```
 *
 * The stream only decides when to call `send`. `send` stamps `at` from the event time it is given,
 * so waiting for a slot never changes when the player acted.
 */
import type { JsonValue } from "@couchcade/protocol";
import type { ClockScheduler } from "../clock/index.ts";
import type { GameInput } from "../contract/index.ts";
import { PHONE_INPUT_MIN_GAP_MS } from "./rates.ts";

/** Events a stream holds before it drops new ones. */
export const INPUT_STREAM_MAX_QUEUE = 8;

/**
 * Sends one input now. A `null` result means the input did not go out (an audience phone, or no
 * socket), which CC-1.16's `createInputSender` returns. Such an input doesn't use the send slot.
 */
export type InputStreamSend<TInput extends GameInput> = (
  input: TInput,
  eventTimeStamp?: number,
) => unknown;

export interface InputStreamOptions {
  /** Minimum time between two sends. Defaults to `PHONE_INPUT_MIN_GAP_MS`. */
  minGapMs?: number;
  /** Most `fire` events held at once. Defaults to `INPUT_STREAM_MAX_QUEUE`. */
  maxQueue?: number;
  /** Local clock in milliseconds. Defaults to `performance.now()`. */
  now?: () => number;
  /** Defaults to `setTimeout` and `clearTimeout`. */
  schedule?: ClockScheduler;
  /** Dev warnings, such as a dropped event. Defaults to `console.warn`. */
  warn?: (message: string) => void;
}

export interface InputStream<TInput extends GameInput> {
  /**
   * A continuous value: the latest per input type wins. Does nothing when the value equals the last
   * one sent for that type, and then also drops a pending value of that type.
   */
  set(input: TInput, eventTimeStamp?: number): void;
  /** A discrete event: queued, never merged, and sent before any pending `set` value. */
  fire(input: TInput, eventTimeStamp?: number): void;
  /**
   * Drops everything pending (disconnect, TV away) and forgets the values sent, so the next `set`
   * goes out even if it repeats one. The 250 ms spacing still counts from the last send.
   */
  clear(): void;
  /** Clears the stream and ignores every later call. */
  dispose(): void;
}

interface Pending<TInput> {
  kind: "set" | "fire";
  input: TInput;
  eventTimeStamp: number | undefined;
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

/**
 * Wraps a send helper so it follows the phone cap (session-flow.md rules 1 to 8):
 *
 * - A send slot opens `minGapMs` after the previous send. When it is open at the moment `set` or
 *   `fire` is called, the input goes out in the same call. Otherwise it goes out when the slot opens.
 * - Queued `fire` events go out oldest first, before pending `set` values. Pending `set` types go
 *   out in the order they started waiting.
 * - One timer, set only while something is pending.
 */
export function createInputStream<TInput extends GameInput>(
  send: InputStreamSend<TInput>,
  options: InputStreamOptions = {},
): InputStream<TInput> {
  const minGapMs = options.minGapMs ?? PHONE_INPUT_MIN_GAP_MS;
  const maxQueue = options.maxQueue ?? INPUT_STREAM_MAX_QUEUE;
  const now = options.now ?? (() => globals.performance.now());
  const schedule = options.schedule ?? scheduleTimeout;
  const warn = options.warn ?? ((message: string) => globals.console.warn(message));

  const queue: Array<Pending<TInput>> = [];
  // Insertion order is the order each type started waiting, which a replaced value keeps.
  const pendingSets = new Map<string, Pending<TInput>>();
  const lastSent = new Map<string, JsonValue | undefined>();
  let lastSendAt = Number.NEGATIVE_INFINITY;
  let cancelTimer: (() => void) | null = null;
  let disposed = false;

  const takeNext = (): Pending<TInput> | undefined => {
    const event = queue.shift();
    if (event !== undefined) return event;
    for (const [type, value] of pendingSets) {
      pendingSets.delete(type);
      return value;
    }
    return undefined;
  };

  const hasPending = (): boolean => queue.length > 0 || pendingSets.size > 0;

  const pump = (): void => {
    if (disposed || cancelTimer !== null || !hasPending()) return;
    const waitMs = lastSendAt + minGapMs - now();
    if (waitMs > 0) {
      cancelTimer = schedule(() => {
        cancelTimer = null;
        pump();
      }, waitMs);
      return;
    }
    for (let next = takeNext(); next !== undefined; next = takeNext()) {
      if (send(next.input, next.eventTimeStamp) === null) continue;
      lastSendAt = now();
      if (next.kind === "set") lastSent.set(next.input.type, next.input.payload);
      break;
    }
    pump();
  };

  const clear = (): void => {
    cancelTimer?.();
    cancelTimer = null;
    queue.length = 0;
    pendingSets.clear();
    lastSent.clear();
  };

  return {
    set(input, eventTimeStamp) {
      if (disposed) return;
      if (lastSent.has(input.type) && jsonEqual(lastSent.get(input.type), input.payload)) {
        pendingSets.delete(input.type);
        return;
      }
      pendingSets.set(input.type, { kind: "set", input, eventTimeStamp });
      pump();
    },
    fire(input, eventTimeStamp) {
      if (disposed) return;
      if (queue.length >= maxQueue) {
        warn(`Input "${input.type}" dropped: ${maxQueue} events are already waiting to send`);
        return;
      }
      queue.push({ kind: "fire", input, eventTimeStamp });
      pump();
    },
    clear,
    dispose() {
      clear();
      disposed = true;
    },
  };
}

/** Structural equality for JSON values (session-flow.md rule 3). Key order doesn't matter. */
function jsonEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => jsonEqual(item, b[index]));
  }
  const aKeys = Object.keys(a).filter((key) => a[key] !== undefined);
  const bKeys = Object.keys(b).filter((key) => b[key] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]));
}
