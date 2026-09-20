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
 * Converts a local timestamp (`clock`'s own clock, such as `performance.now()`) to room time.
 * Shared with the real-time input channel's browser wiring (`./link.ts`, CC-3.19), so `send` and
 * `input.stream`/`input.fire` stamp `at` the same way (docs/architecture/realtime-link.md, "The
 * phone decides its own shot", rule 5: "Timing still comes from `at`").
 */
export function localToRoomTime(
  localMs: number,
  toHostTime: (localTimestamp: number) => number = roomToHostTime,
  clock: LocalClock = globalThis.performance,
): number {
  return toHostTime(clock.timeOrigin + localMs);
}

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
    const at = localToRoomTime(actedAt, toHostTime, clock);
    const d =
      input.payload === undefined
        ? { type: input.type, at }
        : { type: input.type, payload: input.payload, at };
    sendMessage({ t: "input", d });
    return at;
  };
}

/**
 * The `ui:action` the in-game "End game" control sends (CC-3.27). Host-side, only the current
 * VIP's tap ends the game early (apps/host/src/runtime/host-runtime.ts); anyone else's is a
 * no-op, the same as a non-VIP's results or menu actions.
 */
export function endGameAction(): PhoneToRelayMessage {
  return { t: "ui:action", d: { action: "end-game" } };
}
