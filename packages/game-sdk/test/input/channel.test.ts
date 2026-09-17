import { describe, expect, it } from "vitest";
import type { InputChannelPath } from "@couchcade/game-sdk/contract";
import {
  createInputChannel,
  INPUT_CHANNEL_MAX_MORE,
  INPUT_CHANNEL_MAX_RESEND,
  INPUT_CHANNEL_RESEND_WINDOW_MS,
  type InputMoreEntry,
} from "@couchcade/game-sdk/input";
import { createFakeLink } from "@couchcade/game-sdk/testing";
import { createVirtualTime } from "../clock/virtual-time.ts";

type Input = { type: "aim"; payload: { yaw: number } } | { type: "shoot"; payload: { n: number } };

interface Sent {
  /** The sample's own timestamp, as given to the send hook. */
  atMs: number;
  /** The virtual clock's `now()` when the hook actually ran -- the real send time. */
  sentAt: number;
  input: Input;
  more?: readonly InputMoreEntry[];
  n?: number;
}

/** A channel on virtual time, with every hook recording what it was called with. */
function createRig({ path: initialPath = "relay" }: { path?: InputChannelPath } = {}) {
  const time = createVirtualTime();
  let path: InputChannelPath = initialPath;
  let pathListener: ((path: InputChannelPath) => void) | undefined;
  const relayStreamSent: Sent[] = [];
  const relayEventSent: Sent[] = [];
  const directStreamSent: Sent[] = [];
  const directEventSent: Sent[] = [];

  const channel = createInputChannel<Input>({
    now: () => time.now,
    schedule: time.schedule,
    path: () => path,
    onPathChange(listener) {
      pathListener = listener;
      return () => {
        pathListener = undefined;
      };
    },
    sendRelayStream: (input, atMs, more) => {
      relayStreamSent.push({ atMs, sentAt: time.now, input, more });
    },
    sendRelayEvent: (input, atMs, n) => {
      relayEventSent.push({ atMs, sentAt: time.now, input, n });
    },
    sendDirectStream: (input, atMs, n) => {
      directStreamSent.push({ atMs, sentAt: time.now, input, n });
    },
    sendDirectEvent: (input, atMs, n) => {
      directEventSent.push({ atMs, sentAt: time.now, input, n });
    },
  });

  return {
    time,
    channel,
    relayStreamSent,
    relayEventSent,
    directStreamSent,
    directEventSent,
    setPath(next: InputChannelPath) {
      path = next;
      pathListener?.(next);
    },
  };
}

const aim = (yaw: number): Input => ({ type: "aim", payload: { yaw } });
const shot = (n: number): Input => ({ type: "shoot", payload: { n } });

describe("createInputChannel: relay stream (AC 2)", () => {
  it("packs up to 7 earlier samples into `more` and sends at most 4 per second, 250 ms apart", () => {
    const { time, channel, relayStreamSent } = createRig({ path: "relay" });

    // 15 samples over 240 ms (roughly 60 Hz), then keep sampling until 1 s has passed.
    for (let t = 0; t <= 240; t += 16) {
      time.advanceTo(t);
      channel.stream(aim(t));
    }
    // The gate opens at once for the first sample; it goes out with nothing buffered yet.
    expect(relayStreamSent).toHaveLength(1);
    expect(relayStreamSent[0]).toMatchObject({ atMs: 0, more: [] });

    time.advanceTo(250);
    expect(relayStreamSent).toHaveLength(2);
    const second = relayStreamSent[1]!;
    expect(second.atMs).toBe(240);
    expect(second.more).toHaveLength(INPUT_CHANNEL_MAX_MORE);
    // Oldest first, each `dtMs` positive: how long before the newest sample it was taken.
    expect(second.more).toEqual([
      [112, { yaw: 128 }],
      [96, { yaw: 144 }],
      [80, { yaw: 160 }],
      [64, { yaw: 176 }],
      [48, { yaw: 192 }],
      [32, { yaw: 208 }],
      [16, { yaw: 224 }],
    ]);

    // Keep sampling every 16 ms up to 1 second: never more often than the 250 ms gate.
    for (let t = 256; t <= 1_000; t += 16) {
      time.advanceTo(t);
      channel.stream(aim(t));
    }
    const gaps = relayStreamSent
      .slice(1)
      .map((sent, i) => sent.sentAt - relayStreamSent[i]!.sentAt);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(250);
    expect(relayStreamSent.length).toBeLessThanOrEqual(5); // at most 4 per second, plus the t=0 kick-off
  });

  it("shares the same 250 ms budget between stream and fire, events first", () => {
    const { time, channel, relayStreamSent, relayEventSent } = createRig({ path: "relay" });
    channel.stream(aim(1)); // sent at once, opens the gate
    time.advanceTo(10);
    channel.fire(shot(1));
    channel.stream(aim(2));
    time.advanceTo(250);
    expect(relayEventSent).toHaveLength(1);
    expect(relayStreamSent).toHaveLength(1); // still just the kick-off; the next slot went to fire
    time.advanceTo(500);
    expect(relayStreamSent).toHaveLength(2);
  });
});

describe("createInputChannel: direct stream (AC 3)", () => {
  it("sends each type at most at its hz and skips a value equal to the last one sent", () => {
    const time = createVirtualTime();
    const link = createFakeLink({ now: () => time.now, schedule: time.schedule });
    const received: Array<{ type: string; payload: unknown; n: number }> = [];
    link.b.onMessage((data) => received.push(JSON.parse(data)));

    const channel = createInputChannel<Input>({
      streams: { aim: { hz: 30 } },
      now: () => time.now,
      schedule: time.schedule,
      path: () => "direct",
      onPathChange: () => () => {},
      sendRelayStream: () => {},
      sendRelayEvent: () => {},
      sendDirectStream: (input, atMs, n) => link.a.send(JSON.stringify({ ...input, atMs, n })),
      sendDirectEvent: () => {},
    });

    channel.stream(aim(1)); // first ever value for the type: always sent
    time.advanceTo(5);
    channel.stream(aim(1)); // equal to the last sent: skipped
    time.advanceTo(10);
    channel.stream(aim(2)); // changed, but under 1000/30 ms since the last send: skipped
    time.advanceTo(40);
    channel.stream(aim(2)); // changed and the slot is open: sent
    time.advanceTo(1_000);

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({ payload: { yaw: 1 }, n: 1 });
    expect(received[1]).toMatchObject({ payload: { yaw: 2 }, n: 2 });
  });

  it("gives a type without an explicit hz the 30 Hz default", () => {
    const { time, channel, directStreamSent } = createRig({ path: "direct" });
    channel.stream(shot(1));
    time.advanceTo(20); // under 1000/30 ms
    channel.stream(shot(2));
    time.advanceTo(40); // now past it
    channel.stream(shot(3));
    expect(directStreamSent.map((s) => (s.input as { payload: { n: number } }).payload.n)).toEqual([
      1, 3,
    ]);
  });
});

describe("createInputChannel: fire (AC 4)", () => {
  it("sends at once on the direct path", () => {
    const { channel, directEventSent, relayEventSent } = createRig({ path: "direct" });
    channel.fire(shot(1));
    expect(directEventSent).toHaveLength(1);
    expect(directEventSent[0]).toMatchObject({ input: shot(1), n: 0 });
    expect(relayEventSent).toHaveLength(0);
  });

  it("resends events fired in the last 500 ms, at most 4, with the same event id, on a switch to relay", () => {
    const { time, channel, directEventSent, relayEventSent, setPath } = createRig({
      path: "direct",
    });

    for (let i = 0; i < 5; i++) {
      time.advanceTo(i * 50); // 0, 50, 100, 150, 200
      channel.fire(shot(i));
    }
    expect(directEventSent).toHaveLength(5);
    const eventIds = directEventSent.map((s) => s.n);
    expect(eventIds).toEqual([0, 1, 2, 3, 4]);

    time.advanceTo(220);
    setPath("relay"); // all 5 fired within the last 500 ms; only the newest 4 are resent

    time.advanceTo(220 + 4 * 250);
    expect(relayEventSent).toHaveLength(INPUT_CHANNEL_MAX_RESEND);
    expect(relayEventSent.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    // Same input and original `atMs` as the direct send, not the time of the resend.
    expect(relayEventSent[0]).toMatchObject({ input: shot(1), atMs: 50 });
  });

  it("doesn't resend an event older than the resend window", () => {
    const { time, channel, relayEventSent, setPath } = createRig({ path: "direct" });

    channel.fire(shot(0));
    time.advanceTo(INPUT_CHANNEL_RESEND_WINDOW_MS + 100);
    channel.fire(shot(1));
    setPath("relay");
    time.advanceTo(INPUT_CHANNEL_RESEND_WINDOW_MS + 100 + 250);

    expect(relayEventSent.map((s) => s.n)).toEqual([1]);
  });

  it("doesn't resend when the path change isn't a switch away from direct", () => {
    const { channel, relayEventSent, setPath } = createRig({ path: "relay" });
    channel.fire(shot(0));
    setPath("relay");
    expect(relayEventSent).toHaveLength(1); // just the original send, no duplicate resend
  });
});

describe("createInputChannel: last, clear and path", () => {
  it("last() returns the newest value given to stream, even one throttled away", () => {
    const { time, channel } = createRig({ path: "direct" });
    expect(channel.last("aim")).toBeNull();
    channel.stream(aim(1));
    time.advanceTo(1);
    channel.stream(aim(2)); // dropped by the direct rate gate, still the newest given to stream()
    expect(channel.last("aim")).toEqual(aim(2));
  });

  it("clear() drops pending relay sends and forgets the direct dedupe state", () => {
    const { time, channel, relayStreamSent, directStreamSent, setPath } = createRig({
      path: "relay",
    });
    channel.stream(aim(1));
    time.advanceTo(1);
    channel.stream(aim(2)); // buffered for the next relay slot
    channel.clear();
    time.advanceTo(1_000);
    expect(relayStreamSent).toHaveLength(1); // only the kick-off; the buffered aim(2) was dropped

    setPath("direct");
    channel.stream(aim(3));
    channel.clear();
    channel.stream(aim(3)); // repeats the last value, but clear() forgot it: sent again
    expect(directStreamSent).toHaveLength(2);
  });

  it("path reflects the live path, not a snapshot taken at creation", () => {
    const { channel, setPath } = createRig({ path: "relay" });
    expect(channel.path).toBe("relay");
    setPath("direct");
    expect(channel.path).toBe("direct");
  });
});
