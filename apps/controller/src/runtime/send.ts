import { toHostTime as roomToHostTime } from "@couchcade/game-sdk/clock";
import type { GameInput } from "@couchcade/game-sdk/contract";
import type { PhoneToRelayMessage } from "@couchcade/protocol";

/** The local clock `toHostTime` expects: `performance.timeOrigin + performance.now()`. */
export interface LocalClock {
  readonly timeOrigin: number;
  now(): number;
}

export interface InputSenderOptions {
  /** Sends one message over the room socket. */
  sendMessage(message: PhoneToRelayMessage): void;
  /** False while this phone may not send input: audience phones, or no socket. */
  canSend(): boolean;
  /** Local time to room time. Defaults to the shared room clock. */
  toHostTime?: (localTimestamp: number) => number;
  /** Defaults to `performance`. */
  clock?: LocalClock;
}

/**
 * Sends one input and returns the `at` it stamped, an integer in room time, or null when the phone
 * may not send right now.
 */
export type InputSender = (input: GameInput, eventTimeStamp?: number) => number | null;

/**
 * The one send helper every game controller uses (docs/architecture/platform.md, "How the phone
 * shows a controller"). It stamps `at` with the room time the player acted, encodes and sends.
 *
 * `eventTimeStamp` is the DOM event's `timeStamp`, which counts from `performance.timeOrigin`, so
 * `at` is `toHostTime(performance.timeOrigin + eventTimeStamp)`. Without one, or with one from the
 * future, it uses the time of the call.
 *
 * It doesn't pace inputs. The input stream (CC-3.6) wraps it to keep phones at 4 messages a second.
 */
export function createInputSender({
  sendMessage,
  canSend,
  toHostTime = roomToHostTime,
  clock = globalThis.performance,
}: InputSenderOptions): InputSender {
  return (input, eventTimeStamp) => {
    if (!canSend()) return null;
    const now = clock.now();
    const actedAt =
      eventTimeStamp !== undefined && Number.isFinite(eventTimeStamp) && eventTimeStamp <= now
        ? eventTimeStamp
        : now;
    const at = toHostTime(clock.timeOrigin + actedAt);
    const d =
      input.payload === undefined
        ? { type: input.type, at }
        : { type: input.type, payload: input.payload, at };
    sendMessage({ t: "input", d });
    return at;
  };
}
