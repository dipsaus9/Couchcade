import { decode, encode, phoneToRelaySchema, type PhoneToRelayMessage } from "@couchcade/protocol";
import { describe, expect, it, vi } from "vitest";
import type { LocalClock } from "../../src/runtime/send.ts";
import {
  calibrationActions,
  createCalibrationTapper,
  minTapGapMs,
  parseCalibrationView,
} from "../../src/screens/calibration/calibration-view.ts";

const timeOrigin = 1_789_000_000_000.25;

function tapper(nowMs = 10_000) {
  let now = nowMs;
  const clock: LocalClock = { timeOrigin, now: () => now };
  const sent: PhoneToRelayMessage[] = [];
  const toHostTime = vi.fn<(t: number) => number>((t) => Math.round(t + 3_500.4));
  const tap = createCalibrationTapper({
    sendMessage: (message) => sent.push(message),
    toHostTime,
    clock,
  });
  return {
    tap,
    sent,
    toHostTime,
    setNow: (ms: number) => {
      now = ms;
    },
  };
}

describe("parseCalibrationView", () => {
  it("reads the VIP flag and whether taps count", () => {
    expect(parseCalibrationView({ vip: true, active: false })).toEqual({
      vip: true,
      active: false,
    });
  });

  it("rejects anything else", () => {
    expect(parseCalibrationView(null)).toBeNull();
    expect(parseCalibrationView([true, true])).toBeNull();
    expect(parseCalibrationView({ vip: "yes", active: true })).toBeNull();
    expect(parseCalibrationView({ vip: true })).toBeNull();
  });
});

describe("calibrationActions", () => {
  it("skips with the VIP's skip-calibration action", () => {
    const message = calibrationActions.skip();
    expect(message).toEqual({ t: "ui:action", d: { action: "skip-calibration" } });
    expect(decode(phoneToRelaySchema, encode(message))).toEqual({ ok: true, message });
  });
});

describe("createCalibrationTapper", () => {
  it("sends calibration:tap with the room time of the tap event, not of the send", () => {
    const { tap, sent, toHostTime } = tapper();
    const at = tap(9_980.75);
    expect(toHostTime).toHaveBeenCalledWith(timeOrigin + 9_980.75);
    expect(at).toBe(Math.round(timeOrigin + 9_980.75 + 3_500.4));
    expect(Number.isInteger(at)).toBe(true);
    expect(sent).toEqual([{ t: "calibration:tap", d: { at } }]);
    expect(decode(phoneToRelaySchema, encode(sent[0]!))).toEqual({ ok: true, message: sent[0] });
  });

  it("uses the time of the call for an event timestamp from the future", () => {
    const { tap, toHostTime } = tapper();
    tap(99_999);
    expect(toHostTime).toHaveBeenCalledWith(timeOrigin + 10_000);
  });

  it("drops taps closer together than 250 ms, so a phone sends at most 4 a second", () => {
    const { tap, sent, setNow } = tapper();
    expect(minTapGapMs).toBe(250);
    expect(tap(10_000)).not.toBeNull();
    setNow(10_249);
    expect(tap(10_249)).toBeNull();
    setNow(10_750);
    expect(tap(10_750)).not.toBeNull();
    expect(sent).toHaveLength(2);
  });
});
