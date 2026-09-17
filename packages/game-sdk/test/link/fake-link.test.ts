import { describe, expect, it } from "vitest";
import { createFakeLink } from "@couchcade/game-sdk/testing";
import { createVirtualTime } from "../clock/virtual-time.ts";

describe("createFakeLink", () => {
  it("delivers a message from a to b, and back, after the configured delay", () => {
    const time = createVirtualTime();
    const link = createFakeLink({ delayMs: 100, now: () => time.now, schedule: time.schedule });
    const fromA: string[] = [];
    const fromB: string[] = [];
    link.b.onMessage((data) => fromB.push(data));
    link.a.onMessage((data) => fromA.push(data));

    link.a.send("hello");
    expect(fromB).toEqual([]);
    time.advanceBy(99);
    expect(fromB).toEqual([]);
    time.advanceBy(1);
    expect(fromB).toEqual(["hello"]);

    link.b.send("hi");
    time.advanceBy(100);
    expect(fromA).toEqual(["hi"]);
  });

  it("adds jitter on top of the base delay, drawn from the injected random source", () => {
    const time = createVirtualTime();
    const draws = [0.5];
    const link = createFakeLink({
      delayMs: 100,
      jitterMs: 20,
      now: () => time.now,
      schedule: time.schedule,
      random: () => draws.shift() ?? 0,
    });
    const received: string[] = [];
    link.b.onMessage((data) => received.push(data));

    link.a.send("x"); // delay = 100 + 0.5 * 20 = 110
    time.advanceBy(109);
    expect(received).toEqual([]);
    time.advanceBy(1);
    expect(received).toEqual(["x"]);
  });

  it("drops a message when the random draw is under the loss rate", () => {
    const time = createVirtualTime();
    const link = createFakeLink({
      delayMs: 10,
      loss: 0.5,
      now: () => time.now,
      schedule: time.schedule,
      random: () => 0.4, // < 0.5: dropped
    });
    const received: string[] = [];
    link.b.onMessage((data) => received.push(data));

    link.a.send("lost");
    time.advanceBy(1_000);
    expect(received).toEqual([]);
  });

  it("delivers when the random draw is at or above the loss rate", () => {
    const time = createVirtualTime();
    const link = createFakeLink({
      delayMs: 10,
      loss: 0.5,
      now: () => time.now,
      schedule: time.schedule,
      random: () => 0.5,
    });
    const received: string[] = [];
    link.b.onMessage((data) => received.push(data));

    link.a.send("kept");
    time.advanceBy(10);
    expect(received).toEqual(["kept"]);
  });

  it("drops every send once dropAfterMs has passed since creation", () => {
    const time = createVirtualTime();
    const link = createFakeLink({
      delayMs: 5,
      dropAfterMs: 1_000,
      now: () => time.now,
      schedule: time.schedule,
    });
    const received: string[] = [];
    link.b.onMessage((data) => received.push(data));

    time.advanceBy(999);
    link.a.send("still up");
    time.advanceBy(5);
    expect(received).toEqual(["still up"]);

    time.advanceBy(1); // now at 1,005 ms since creation, past dropAfterMs
    link.a.send("gone");
    time.advanceBy(100);
    expect(received).toEqual(["still up"]);
  });

  it("close() cancels pending deliveries and stops further sends", () => {
    const time = createVirtualTime();
    const link = createFakeLink({ delayMs: 100, now: () => time.now, schedule: time.schedule });
    const received: string[] = [];
    link.b.onMessage((data) => received.push(data));

    link.a.send("pending");
    link.close();
    time.advanceBy(1_000);
    expect(received).toEqual([]);
    expect(time.pending).toBe(0);

    link.a.send("after close");
    time.advanceBy(1_000);
    expect(received).toEqual([]);
  });

  it("unsubscribing a listener stops delivery to it without affecting others", () => {
    const time = createVirtualTime();
    const link = createFakeLink({ delayMs: 10, now: () => time.now, schedule: time.schedule });
    const first: string[] = [];
    const second: string[] = [];
    const unsubscribeFirst = link.b.onMessage((data) => first.push(data));
    link.b.onMessage((data) => second.push(data));

    unsubscribeFirst();
    link.a.send("only second");
    time.advanceBy(10);
    expect(first).toEqual([]);
    expect(second).toEqual(["only second"]);
  });

  it("bufferedAmount reads 0 on both sides", () => {
    const link = createFakeLink();
    expect(link.a.bufferedAmount).toBe(0);
    expect(link.b.bufferedAmount).toBe(0);
  });
});
