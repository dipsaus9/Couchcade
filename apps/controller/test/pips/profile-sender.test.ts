import type { PipProfile } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { createProfileSender } from "../../src/pips/profile-sender.ts";

const a: PipProfile = { skin: 0, hair: 0, hairColour: 0 };
const b: PipProfile = { skin: 1, hair: 0, hairColour: 0 };
const c: PipProfile = { skin: 2, hair: 0, hairColour: 0 };

/** A controllable clock + timer queue, so the 400ms/1000ms rule is checked exactly, never flaky. */
function fakeClock() {
  let now = 0;
  const scheduled: { at: number; run: () => void }[] = [];
  return {
    now: () => now,
    setTimer: (run: () => void, ms: number) => {
      const entry = { at: now + ms, run };
      scheduled.push(entry);
      return entry;
    },
    clearTimer: (handle: unknown) => {
      const index = scheduled.indexOf(handle as (typeof scheduled)[number]);
      if (index !== -1) scheduled.splice(index, 1);
    },
    advance(ms: number): void {
      const target = now + ms;
      // Fire timers at their exact due time (not jumped to `target`), so `now()` inside a fired
      // callback reads the real elapsed time, matching a real setTimeout.
      for (;;) {
        scheduled.sort((x, y) => x.at - y.at);
        const next = scheduled[0];
        if (!next || next.at > target) break;
        now = next.at;
        scheduled.shift();
        next.run();
      }
      now = target;
    },
  };
}

describe("createProfileSender", () => {
  it("sends 400ms after the last change", () => {
    const sent: PipProfile[] = [];
    const clock = fakeClock();
    const sender = createProfileSender({
      send: (p) => sent.push(p),
      initial: a,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    sender.update(b);
    clock.advance(399);
    expect(sent).toEqual([]);
    clock.advance(1);
    expect(sent).toEqual([b]);
  });

  it("debounces: only the last look in a flurry within 400ms is sent", () => {
    const sent: PipProfile[] = [];
    const clock = fakeClock();
    const sender = createProfileSender({
      send: (p) => sent.push(p),
      initial: a,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    sender.update(b);
    clock.advance(200);
    sender.update(c);
    clock.advance(400);
    expect(sent).toEqual([c]);
  });

  it("never sends a look that already matches the last one sent (dedup)", () => {
    const sent: PipProfile[] = [];
    const clock = fakeClock();
    const sender = createProfileSender({
      send: (p) => sent.push(p),
      initial: a,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    sender.update(a);
    clock.advance(1000);
    expect(sent).toEqual([]);
  });

  it("cancels a pending send that flips back to the current look before the debounce fires", () => {
    const sent: PipProfile[] = [];
    const clock = fakeClock();
    const sender = createProfileSender({
      send: (p) => sent.push(p),
      initial: a,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    sender.update(b);
    clock.advance(100);
    sender.update(a);
    clock.advance(1000);
    expect(sent).toEqual([]);
  });

  it("never sends more than once a second, even with changes every 500ms", () => {
    const sent: PipProfile[] = [];
    const clock = fakeClock();
    const sender = createProfileSender({
      send: (p) => sent.push(p),
      initial: a,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    sender.update(b); // t=0, would fire at 400
    clock.advance(500); // t=500: b already sent at t=400 -> sent=[b]
    sender.update(c); // t=500, next send floors to 400ms since lastSentAt(400) -> earliest 1000ms after that -> wait = max(400, 1000-100)=900
    clock.advance(899);
    expect(sent).toEqual([b]);
    clock.advance(1);
    expect(sent).toEqual([b, c]);
    // The two sends are exactly 1000ms apart.
  });

  it("dispose cancels a pending send", () => {
    const sent: PipProfile[] = [];
    const clock = fakeClock();
    const sender = createProfileSender({
      send: (p) => sent.push(p),
      initial: a,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    sender.update(b);
    sender.dispose();
    clock.advance(1000);
    expect(sent).toEqual([]);
  });
});
