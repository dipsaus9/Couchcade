import { roomClock } from "@couchcade/game-sdk/clock";
import { decode, encode, phoneToRelaySchema, type PhoneToRelayMessage } from "@couchcade/protocol";
import { describe, expect, it, vi } from "vitest";
import { createInputSender, endGameAction, type LocalClock } from "../../src/runtime/send.ts";

const timeOrigin = 1_789_000_000_000.25;
const clock: LocalClock = { timeOrigin, now: () => 5_000.5 };

function sender(options: { canSend?: boolean; toHostTime?: (t: number) => number } = {}) {
  const sent: PhoneToRelayMessage[] = [];
  const send = createInputSender({
    sendMessage: (message) => sent.push(message),
    canSend: () => options.canSend ?? true,
    toHostTime: options.toHostTime ?? ((t) => Math.round(t + 3_500.4)),
    clock,
  });
  return { send, sent };
}

describe("createInputSender", () => {
  it("stamps at from timeOrigin plus the event's timeStamp, in room time", () => {
    const toHostTime = vi.fn<(t: number) => number>((t) => Math.round(t + 3_500.4));
    const { send, sent } = sender({ toHostTime });

    const at = send({ type: "tap" }, 4_980.75);

    expect(toHostTime).toHaveBeenCalledWith(timeOrigin + 4_980.75);
    expect(at).toBe(Math.round(timeOrigin + 4_980.75 + 3_500.4));
    expect(Number.isInteger(at)).toBe(true);
    expect(sent).toEqual([{ t: "input", d: { type: "tap", at } }]);
  });

  it("sends a valid input frame with the payload", () => {
    const { send, sent } = sender();
    const at = send({ type: "pick", payload: { number: 7 } }, 4_000);

    expect(sent).toEqual([{ t: "input", d: { type: "pick", payload: { number: 7 }, at } }]);
    const frame = encode(sent[0]!);
    expect(decode(phoneToRelaySchema, frame)).toEqual({ ok: true, message: sent[0] });
  });

  it("uses the time of the call without an event time, or with one that can't be right", () => {
    const { send } = sender({ toHostTime: (t) => Math.round(t) });
    const now = Math.round(timeOrigin + 5_000.5);

    expect(send({ type: "tap" })).toBe(now);
    expect(send({ type: "tap" }, Number.NaN)).toBe(now);
    // An epoch-based timeStamp from an old browser is in the future on this timeline.
    expect(send({ type: "tap" }, Date.now())).toBe(now);
  });

  it("uses the shared room clock by default", () => {
    const sent: PhoneToRelayMessage[] = [];
    const send = createInputSender({
      sendMessage: (m) => sent.push(m),
      canSend: () => true,
      clock,
    });
    const offset = roomClock.offsetMs ?? 0;
    expect(send({ type: "tap" }, 4_000.4)).toBe(Math.round(timeOrigin + 4_000.4 + offset));
    expect(sent).toHaveLength(1);
  });

  it("sends nothing when the phone may not send", () => {
    const { send, sent } = sender({ canSend: false });
    expect(send({ type: "tap" }, 4_000)).toBeNull();
    expect(sent).toEqual([]);
  });
});

describe("endGameAction", () => {
  it("builds a valid end-game ui:action frame (CC-3.27)", () => {
    const message = endGameAction();

    expect(message).toEqual({ t: "ui:action", d: { action: "end-game" } });
    const frame = encode(message);
    expect(decode(phoneToRelaySchema, frame)).toEqual({ ok: true, message });
  });
});
