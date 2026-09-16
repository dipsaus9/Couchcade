import { describe, expect, it } from "vitest";
import {
  lostScreenDelayMs,
  watchReconnect,
  type Scheduler,
  type VisibilitySource,
} from "../../src/runtime/reconnect.ts";

function setup() {
  let closed = false;
  let reconnects = 0;
  let lostShown = 0;

  const timers = new Set<{ at: number; callback: () => void }>();
  let now = 0;
  const schedule: Scheduler = (callback, delayMs) => {
    const timer = { at: now + delayMs, callback };
    timers.add(timer);
    return () => timers.delete(timer);
  };
  const advance = (ms: number) => {
    now += ms;
    for (const timer of [...timers].filter((t) => t.at <= now)) {
      timers.delete(timer);
      timer.callback();
    }
  };

  const listeners = new Set<() => void>();
  const page = {
    visibilityState: "hidden" as DocumentVisibilityState,
    addEventListener: (_type: "visibilitychange", listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: "visibilitychange", listener: () => void) =>
      listeners.delete(listener),
  } satisfies VisibilitySource;
  const show = (state: DocumentVisibilityState) => {
    page.visibilityState = state;
    for (const listener of listeners) listener();
  };

  const watch = watchReconnect({
    isClosed: () => closed,
    reconnectNow: () => (reconnects += 1),
    onLostTooLong: () => (lostShown += 1),
    visibility: page,
    schedule,
  });

  return {
    watch,
    advance,
    show,
    setClosed: (value: boolean) => (closed = value),
    reconnects: () => reconnects,
    lostShown: () => lostShown,
    listeners: () => listeners.size,
    timers: () => timers.size,
  };
}

describe("watchReconnect", () => {
  it("shows Connection lost only after 1 second without a socket", () => {
    const t = setup();
    expect(lostScreenDelayMs).toBe(1000);
    t.watch.lost();
    t.advance(999);
    expect(t.lostShown()).toBe(0);
    t.advance(1);
    expect(t.lostShown()).toBe(1);
  });

  it("never shows it for a reconnect inside that second", () => {
    const t = setup();
    t.watch.lost();
    t.advance(600);
    t.watch.opened();
    t.advance(5000);
    expect(t.lostShown()).toBe(0);
  });

  it("keeps the first drop's deadline when the socket fails again", () => {
    const t = setup();
    t.watch.lost();
    t.advance(700);
    t.watch.lost();
    t.advance(300);
    expect(t.lostShown()).toBe(1);
  });

  it("reconnects at once when the page becomes visible and the socket is closed", () => {
    const t = setup();
    t.setClosed(true);
    t.show("hidden");
    expect(t.reconnects()).toBe(0);
    t.show("visible");
    expect(t.reconnects()).toBe(1);
  });

  it("leaves an open or connecting socket alone when the page becomes visible", () => {
    const t = setup();
    t.show("visible");
    expect(t.reconnects()).toBe(0);
  });

  it("stops listening and cancels a pending Connection lost on dispose", () => {
    const t = setup();
    t.watch.lost();
    t.watch.dispose();
    expect(t.listeners()).toBe(0);
    expect(t.timers()).toBe(0);
    t.setClosed(true);
    t.show("visible");
    expect(t.reconnects()).toBe(0);
  });
});
