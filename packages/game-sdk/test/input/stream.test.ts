import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameInput } from "@couchcade/game-sdk/contract";
import {
  createInputStream,
  HOST_STATE_MAX_PER_SECOND,
  HOST_STATE_MIN_GAP_MS,
  INPUT_STREAM_MAX_QUEUE,
  PHONE_INPUT_MAX_PER_SECOND,
  PHONE_INPUT_MIN_GAP_MS,
} from "@couchcade/game-sdk/input";
import type { InputStreamOptions } from "@couchcade/game-sdk/input";

interface Sent {
  /** Fake time of the send. */
  sentAt: number;
  input: GameInput;
  eventTimeStamp: number | undefined;
}

/** A stream on Vitest's fake timers, with the default clock and scheduler. */
function createRig(options: InputStreamOptions & { refuse?: () => boolean } = {}) {
  const sent: Sent[] = [];
  const warn = vi.fn<(message: string) => void>();
  const stream = createInputStream(
    (input: GameInput, eventTimeStamp?: number) => {
      if (options.refuse?.()) return null;
      sent.push({ sentAt: performance.now(), input, eventTimeStamp });
      return Math.round(performance.now());
    },
    { warn, ...options },
  );
  const start = performance.now();
  /** Fake milliseconds since the rig was made. */
  const elapsed = () => performance.now() - start;
  const times = () => sent.map((s) => s.sentAt - start);
  return { stream, sent, warn, elapsed, times };
}

const tilt = (x: number): GameInput => ({ type: "tilt", payload: { x } });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rates", () => {
  it("match the caps in platform.md", () => {
    expect(PHONE_INPUT_MAX_PER_SECOND).toBe(4);
    expect(PHONE_INPUT_MIN_GAP_MS).toBe(250);
    expect(PHONE_INPUT_MIN_GAP_MS * PHONE_INPUT_MAX_PER_SECOND).toBe(1000);
    expect(HOST_STATE_MAX_PER_SECOND).toBe(1.5);
    expect(HOST_STATE_MIN_GAP_MS).toBe(667);
    expect(1000 / HOST_STATE_MIN_GAP_MS).toBeLessThanOrEqual(HOST_STATE_MAX_PER_SECOND);
  });
});

describe("createInputStream", () => {
  it("sends in the same call when the slot is open", () => {
    const { stream, sent } = createRig();

    stream.set(tilt(0.5), 12.5);

    expect(sent).toEqual([{ sentAt: expect.any(Number), input: tilt(0.5), eventTimeStamp: 12.5 }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never sends more than 4 messages in any 1,000 ms, at least 250 ms apart", () => {
    const { stream, times } = createRig();

    // A tilt that changes every frame for 5 seconds, with a button press now and then.
    for (let frame = 0; frame < 300; frame++) {
      stream.set(tilt(frame));
      if (frame % 7 === 0) stream.fire({ type: "dash" });
      vi.advanceTimersByTime(1000 / 60);
    }
    vi.advanceTimersByTime(5_000);

    const sentAt = times();
    expect(sentAt.length).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < sentAt.length; i++) {
      expect(sentAt[i]! - sentAt[i - 1]!).toBeGreaterThanOrEqual(PHONE_INPUT_MIN_GAP_MS - 1e-6);
    }
    for (const windowStart of sentAt) {
      const inWindow = sentAt.filter((t) => t >= windowStart && t < windowStart + 1000);
      expect(inWindow.length).toBeLessThanOrEqual(PHONE_INPUT_MAX_PER_SECOND);
    }
  });

  it("sends nothing for a value equal to the last one sent", () => {
    const { stream, sent } = createRig();

    stream.set({ type: "tilt", payload: { x: 1, y: [2, 3] } });
    vi.advanceTimersByTime(1_000);
    stream.set({ type: "tilt", payload: { y: [2, 3], x: 1 } });
    vi.advanceTimersByTime(1_000);

    expect(sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops a pending value that changes back to the last one sent", () => {
    const { stream, sent } = createRig();

    stream.set(tilt(1));
    stream.set(tilt(2));
    stream.set(tilt(1));
    vi.advanceTimersByTime(1_000);

    expect(sent.map((s) => s.input)).toEqual([tilt(1)]);
  });

  it("sends the latest pending value per type at the 250 ms mark, with its event time", () => {
    const { stream, sent, times } = createRig();

    stream.set(tilt(1), 1);
    vi.advanceTimersByTime(50);
    stream.set(tilt(2), 50);
    vi.advanceTimersByTime(50);
    stream.set(tilt(3), 100);
    vi.advanceTimersByTime(149);
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(times()).toEqual([0, 250]);
    expect(sent[1]).toMatchObject({ input: tilt(3), eventTimeStamp: 100 });
  });

  it("sends a fire event at once when 250 ms have passed since the last send", () => {
    const { stream, times } = createRig();

    stream.set(tilt(1));
    vi.advanceTimersByTime(300);
    stream.fire({ type: "release" });

    expect(times()).toEqual([0, 300]);
  });

  it("holds a fire event to the 250 ms mark when the last send was sooner", () => {
    const { stream, sent, times } = createRig();

    stream.set(tilt(1));
    vi.advanceTimersByTime(100);
    stream.fire({ type: "release" }, 100);
    vi.advanceTimersByTime(149);
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(times()).toEqual([0, 250]);
    expect(sent[1]).toMatchObject({ input: { type: "release" }, eventTimeStamp: 100 });
  });

  it("sends fire events oldest first, before pending set values oldest first", () => {
    const { stream, sent, times } = createRig();

    stream.fire({ type: "open" });
    stream.set({ type: "aim", payload: 1 });
    stream.set({ type: "tilt", payload: 1 });
    stream.fire({ type: "shot", payload: 1 });
    stream.set({ type: "aim", payload: 2 });
    stream.fire({ type: "shot", payload: 2 });
    vi.advanceTimersByTime(2_000);

    expect(sent.map((s) => s.input)).toEqual([
      { type: "open" },
      { type: "shot", payload: 1 },
      { type: "shot", payload: 2 },
      { type: "aim", payload: 2 },
      { type: "tilt", payload: 1 },
    ]);
    expect(times()).toEqual([0, 250, 500, 750, 1000]);
  });

  it("holds at most 8 events and drops a ninth with a dev warning", () => {
    const { stream, sent, warn } = createRig();

    stream.fire({ type: "tap", payload: 0 }); // goes out at once
    for (let i = 1; i <= INPUT_STREAM_MAX_QUEUE + 1; i++) stream.fire({ type: "tap", payload: i });
    vi.advanceTimersByTime(5_000);

    expect(INPUT_STREAM_MAX_QUEUE).toBe(8);
    expect(sent.map((s) => s.input.payload)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"tap"');
  });

  it("keeps one timer, only while something is pending", () => {
    const { stream } = createRig();

    stream.set(tilt(1));
    expect(vi.getTimerCount()).toBe(0);
    stream.set(tilt(2));
    stream.fire({ type: "dash" });
    stream.set({ type: "aim", payload: 1 });
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(250);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clear drops everything pending and forgets the values sent", () => {
    const { stream, sent, times } = createRig();

    stream.set(tilt(1));
    stream.set(tilt(2));
    stream.fire({ type: "dash" });
    stream.clear();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1_000);
    expect(sent).toHaveLength(1);

    stream.set(tilt(1));
    stream.set({ type: "aim", payload: 1 });
    vi.advanceTimersByTime(1_000);
    expect(sent.map((s) => s.input)).toEqual([tilt(1), tilt(1), { type: "aim", payload: 1 }]);
    expect(times()).toEqual([0, 1000, 1250]);
  });

  it("keeps the 250 ms spacing across a clear", () => {
    const { stream, times } = createRig();

    stream.set(tilt(1));
    vi.advanceTimersByTime(100);
    stream.clear();
    stream.set(tilt(2));
    vi.advanceTimersByTime(500);

    expect(times()).toEqual([0, 250]);
  });

  it("dispose stops the stream for good", () => {
    const { stream, sent } = createRig();

    stream.set(tilt(1));
    stream.set(tilt(2));
    stream.dispose();
    stream.set(tilt(3));
    stream.fire({ type: "dash" });
    vi.advanceTimersByTime(1_000);

    expect(sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats a null result from send as not sent: no slot used and the value not remembered", () => {
    let refuse = true;
    const { stream, sent, times } = createRig({ refuse: () => refuse });

    stream.set(tilt(1));
    stream.fire({ type: "dash" });
    expect(vi.getTimerCount()).toBe(0);

    refuse = false;
    vi.advanceTimersByTime(10);
    stream.set(tilt(1));
    expect(sent.map((s) => s.input)).toEqual([tilt(1)]);
    expect(times()).toEqual([10]);
  });

  it("takes an injected clock and scheduler", () => {
    vi.useRealTimers();
    let now = 0;
    const timers: Array<{ at: number; run: () => void }> = [];
    const sent: number[] = [];
    const stream = createInputStream(() => sent.push(now), {
      minGapMs: 100,
      now: () => now,
      schedule: (run, delayMs) => {
        const timer = { at: now + delayMs, run };
        timers.push(timer);
        return () => timers.splice(timers.indexOf(timer), 1);
      },
    });

    stream.set(tilt(1));
    stream.set(tilt(2));
    expect(timers.map((t) => t.at)).toEqual([100]);
    now = 100;
    timers.shift()!.run();

    expect(sent).toEqual([0, 100]);
  });
});
