import { toHostTime as roomToHostTime } from "@couchcade/game-sdk/clock";
import type { JsonValue, PhoneToRelayMessage } from "@couchcade/protocol";
import type { LocalClock } from "../../runtime/send.ts";

/**
 * The `calibration` view from the host (docs/architecture/session-flow.md, "TV lag calibration").
 * apps/host/src/screens/calibration/calibration.ts builds it.
 */
export interface CalibrationView {
  /** True for the VIP, whose phone also offers "Skip". */
  vip: boolean;
  /** True while the TV flashes and taps count. False while the TV offers "Try again". */
  active: boolean;
}

/** The calibration view in `data`, or null when it isn't one. */
export function parseCalibrationView(data: JsonValue): CalibrationView | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (typeof data.vip !== "boolean" || typeof data.active !== "boolean") return null;
  return { vip: data.vip, active: data.active };
}

type UiActionMessage = Extract<PhoneToRelayMessage, { t: "ui:action" }>;

export const calibrationActions = {
  skip: (): UiActionMessage => ({ t: "ui:action", d: { action: "skip-calibration" } }),
};

/**
 * Taps closer together than this are dropped. Tapping along with a 750 ms beat never needs more,
 * and it keeps a mashing phone at the platform's 4 messages per second.
 */
export const minTapGapMs = 250;

export interface CalibrationTapperOptions {
  sendMessage(message: PhoneToRelayMessage): void;
  /** Local time to room time. Defaults to the shared room clock. */
  toHostTime?: (localTimestamp: number) => number;
  /** Defaults to `performance`. */
  clock?: LocalClock;
}

/**
 * Sends `calibration:tap { at }` for a tap on the big button and returns `at`, or null when the tap
 * came too soon after the last one. `at` is the room time of the tap event's own `timeStamp`, so
 * neither the network nor the main thread moves it.
 */
export function createCalibrationTapper({
  sendMessage,
  toHostTime = roomToHostTime,
  clock = globalThis.performance,
}: CalibrationTapperOptions): (eventTimeStamp: number) => number | null {
  let lastTapAt = Number.NEGATIVE_INFINITY;
  return (eventTimeStamp) => {
    const now = clock.now();
    const tappedAt =
      Number.isFinite(eventTimeStamp) && eventTimeStamp <= now ? eventTimeStamp : now;
    if (tappedAt - lastTapAt < minTapGapMs) return null;
    lastTapAt = tappedAt;
    const at = toHostTime(clock.timeOrigin + tappedAt);
    sendMessage({ t: "calibration:tap", d: { at } });
    return at;
  };
}
