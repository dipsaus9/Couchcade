import { describe, expect, it } from "vitest";
import { createRng } from "@couchcade/utils";
import {
  clockBurstGapMs,
  clockBurstSamples,
  clockResyncMs,
  clockWindowSamples,
  createRoomClock,
  roomClock,
  toHostTime,
} from "@couchcade/game-sdk/clock";
import type { ClockPing } from "@couchcade/game-sdk/clock";
import { linkClockSampleOf, linkOffsetToRoom } from "@couchcade/game-sdk/link";
import { createVirtualTime } from "./virtual-time.ts";

const localEpoch = 1_789_000_000_000;

/** A clock on virtual time whose pings are only recorded. Tests answer them by hand. */
function createManualRig() {
  const time = createVirtualTime();
  const clock = createRoomClock({ now: () => localEpoch + time.now, schedule: time.schedule });
  const sent: Array<ClockPing & { at: number }> = [];
  const send = (ping: ClockPing) => sent.push({ ...ping, at: time.now });
  /**
   * Answers a ping now as a room clock `offsetMs` ahead of the local one, on a path that is equally
   * slow both ways, so every sample says exactly `offsetMs`. Pings and answers land on even
   * virtual milliseconds in these tests, which keeps `t1` an integer.
   */
  const answer = (ping: ClockPing, offsetMs: number) =>
    clock.receive({
      id: ping.id,
      t0: ping.t0,
      t1: (ping.t0 + localEpoch + time.now) / 2 + offsetMs,
    });
  const answerAll = (offsetMs: number) => {
    for (const ping of sent.splice(0)) answer(ping, offsetMs);
  };
  return { time, clock, sent, send, answer, answerAll };
}

describe("sampling schedule", () => {
  it("takes 5 samples 200 ms apart on connect, then 1 every 30 seconds", () => {
    const { time, clock, sent, send } = createManualRig();
    clock.connect(send);
    time.advanceTo(3 * clockResyncMs);

    expect([clockBurstSamples, clockBurstGapMs, clockResyncMs]).toEqual([5, 200, 30_000]);
    expect(sent.map((ping) => ping.at)).toEqual([0, 200, 400, 600, 800, 30_000, 60_000, 90_000]);
    expect(sent.map((ping) => ping.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(sent.every((ping) => ping.t0 === localEpoch + ping.at)).toBe(true);
  });

  it("stops on disconnect and takes a fresh burst after a reconnect", () => {
    const { time, clock, sent, send } = createManualRig();
    clock.connect(send);
    time.advanceTo(45_000);
    clock.disconnect();
    expect(time.pending).toBe(0);

    time.advanceTo(100_000);
    expect(sent.map((ping) => ping.at)).toEqual([0, 200, 400, 600, 800, 30_000]);

    clock.connect(send);
    time.advanceTo(130_000);
    expect(sent.slice(6).map((ping) => ping.at)).toEqual([
      100_000, 100_200, 100_400, 100_600, 100_800, 130_000,
    ]);
  });

  it("treats a second connect without a disconnect as a reconnect", () => {
    const { time, clock, sent, send } = createManualRig();
    clock.connect(send);
    time.advanceTo(10_000);
    clock.connect(send);
    time.advanceTo(40_000);
    expect(sent.map((ping) => ping.at)).toEqual([
      0, 200, 400, 600, 800, 10_000, 10_200, 10_400, 10_600, 10_800, 40_000,
    ]);
  });
});

describe("estimate", () => {
  it("is synced only after 5 pongs", async () => {
    const { time, clock, sent, send, answer } = createManualRig();
    let resolved = false;
    void clock.whenSynced().then(() => (resolved = true));

    clock.connect(send);
    time.advanceTo(800);
    for (const ping of sent.slice(0, 4)) answer(ping, 2_500);
    await Promise.resolve();
    expect([clock.synced, clock.offsetMs, resolved]).toEqual([false, null, false]);

    answer(sent[4]!, 2_500);
    await Promise.resolve();
    expect([clock.synced, clock.offsetMs, resolved]).toEqual([true, 2_500, true]);
    await expect(clock.whenSynced()).resolves.toBeUndefined();
  });

  it("uses the last 8 samples", () => {
    const { time, clock, send, answerAll } = createManualRig();
    expect(clockWindowSamples).toBe(8);
    clock.connect(send);
    // Answer every ping as it goes out, so all round trips are equal and the filter keeps them.
    for (const at of [0, 200, 400, 600, 800]) {
      time.advanceTo(at);
      answerAll(1_000);
    }
    expect(clock.offsetMs).toBe(1_000);

    // Four resync samples at 2,000 are 4 of 8: the median sits between the two groups.
    for (let resync = 1; resync <= 4; resync++) {
      time.advanceTo(resync * clockResyncMs);
      answerAll(2_000);
    }
    expect(clock.offsetMs).toBe(1_500);

    // Four more push every 1,000 sample out of the window.
    for (let resync = 5; resync <= 8; resync++) {
      time.advanceTo(resync * clockResyncMs);
      answerAll(2_000);
    }
    expect(clock.offsetMs).toBe(2_000);
  });

  it("keeps the old offset after a reconnect until 5 new samples are in", () => {
    const { time, clock, sent, send, answerAll, answer } = createManualRig();
    clock.connect(send);
    time.advanceTo(800);
    answerAll(1_000);

    clock.disconnect();
    time.advanceTo(60_000);
    clock.connect(send);
    time.advanceTo(60_800);
    for (const ping of sent.slice(0, 4)) answer(ping, 3_000);
    expect([clock.synced, clock.offsetMs]).toEqual([false, 1_000]);
    expect(clock.toHostTime(localEpoch)).toBe(localEpoch + 1_000);

    answer(sent[4]!, 3_000);
    expect([clock.synced, clock.offsetMs]).toEqual([true, 3_000]);
  });

  it("ignores pongs it didn't ask for on this connection", () => {
    const { time, clock, sent, send, answer } = createManualRig();
    clock.connect(send);
    time.advanceTo(800);
    const firstBurst = sent.splice(0);

    clock.disconnect();
    clock.connect(send);
    time.advanceTo(1_600);
    for (const ping of firstBurst) answer(ping, 9_999);
    clock.receive({ id: 999, t0: localEpoch, t1: localEpoch });
    clock.receive({ id: sent[0]!.id, t0: sent[0]!.t0 + 1, t1: localEpoch });
    expect([clock.synced, clock.offsetMs, clock.lastRttMs]).toEqual([false, null, null]);

    for (const ping of sent) answer(ping, 700);
    expect([clock.synced, clock.offsetMs]).toEqual([true, 700]);
  });

  it("reports the latest round trip", () => {
    const { time, clock, sent, send } = createManualRig();
    clock.connect(send);
    time.advanceTo(37);
    const ping = sent[0]!;
    clock.receive({ id: ping.id, t0: ping.t0, t1: ping.t0 });
    expect(clock.lastRttMs).toBe(37);
  });
});

describe("toHostTime", () => {
  it("returns integer room time, rounded", () => {
    const { time, clock, sent, send } = createManualRig();
    clock.connect(send);
    // Each pong arrives 1 ms after its ping, so the offset lands on a half millisecond.
    for (const [index, at] of [0, 200, 400, 600, 800].entries()) {
      time.advanceTo(at + 1);
      const ping = sent[index]!;
      clock.receive({ id: ping.id, t0: ping.t0, t1: ping.t0 + 250 });
    }
    expect(clock.offsetMs).toBe(249.5);

    expect(clock.toHostTime(localEpoch + 10)).toBe(localEpoch + 260);
    expect(clock.toHostTime(localEpoch + 10.2)).toBe(localEpoch + 260);
    expect(clock.toHostTime(localEpoch + 10.7)).toBe(localEpoch + 260);
    expect(Number.isInteger(clock.toHostTime(localEpoch + 0.123))).toBe(true);
  });

  it("is exported on the shared room clock, using the local time until it syncs", () => {
    expect(roomClock.synced).toBe(false);
    expect(toHostTime(localEpoch + 0.6)).toBe(localEpoch + 1);
    expect(toHostTime(localEpoch + 0.6)).toBe(roomClock.toHostTime(localEpoch + 0.6));
  });
});

describe("link offset (CC-3.23)", () => {
  it("prefers the link offset over the relay-derived offset while it is set", () => {
    const { time, clock, send, answerAll } = createManualRig();
    clock.connect(send);
    for (const at of [0, 200, 400, 600, 800]) {
      time.advanceTo(at);
      answerAll(1_000);
    }
    expect(clock.offsetMs).toBe(1_000);
    expect(clock.toHostTime(localEpoch)).toBe(localEpoch + 1_000);

    clock.setLinkOffset(250);
    expect(clock.toHostTime(localEpoch)).toBe(localEpoch + 250);
    // The relay-derived offset keeps updating underneath, it's just not used while direct.
    time.advanceTo(clockResyncMs);
    expect(clock.offsetMs).toBe(1_000);

    clock.setLinkOffset(null);
    expect(clock.toHostTime(localEpoch)).toBe(localEpoch + 1_000);
  });

  it("works before any relay sync at all -- toHostTime falls back to 0, not the link offset's absence", () => {
    const { clock } = createManualRig();
    expect(clock.toHostTime(localEpoch + 10)).toBe(localEpoch + 10);
    clock.setLinkOffset(500);
    expect(clock.toHostTime(localEpoch + 10)).toBe(localEpoch + 510);
    // Calling it with no connection at all (link torn down before the room socket ever opened) is
    // harmless: nothing to send, nothing to schedule.
    clock.setLinkOffset(null);
    expect(clock.toHostTime(localEpoch + 10)).toBe(localEpoch + 10);
  });

  it("pauses the periodic resync clock:ping while a link offset is set (AC1)", () => {
    const { time, clock, sent, send } = createManualRig();
    clock.connect(send);
    time.advanceTo(800);
    expect(sent.length).toBe(clockBurstSamples);

    clock.setLinkOffset(123);
    time.advanceTo(3 * clockResyncMs);
    // Three resync ticks came and went at 30/60/90 s; none of them reached the room.
    expect(sent.length).toBe(clockBurstSamples);
  });

  it("sends a relay sample at once, then resumes the 30 s rhythm, on leaving direct (AC2)", () => {
    const { time, clock, sent, send } = createManualRig();
    clock.connect(send);
    time.advanceTo(800);
    clock.setLinkOffset(123);
    time.advanceTo(3 * clockResyncMs);
    expect(sent.length).toBe(clockBurstSamples); // still just the burst

    const clearedAt = 3 * clockResyncMs + 5_000;
    time.advanceTo(clearedAt);
    clock.setLinkOffset(null);
    expect(sent.map((ping) => ping.at)).toEqual([0, 200, 400, 600, 800, clearedAt]);

    // The 30 s rhythm resumes from the moment it was cleared, not from the paused schedule.
    time.advanceTo(clearedAt + clockResyncMs);
    expect(sent.at(-1)!.at).toBe(clearedAt + clockResyncMs);
  });

  it("still takes the 5-sample burst on connect even with a leftover link offset (AC3)", () => {
    const { time, clock, sent, send } = createManualRig();
    clock.setLinkOffset(999);
    clock.connect(send);
    time.advanceTo(800);
    expect(sent.length).toBe(clockBurstSamples);
    // A fresh connect always starts back on the relay path.
    expect(clock.toHostTime(localEpoch)).toBe(localEpoch);
  });
});

/**
 * A phone linked directly to the host over WebRTC (docs/architecture/realtime-link.md, "Refining
 * a phone's clock over the link"). Forward and return delays are deliberately asymmetric -- 30 to
 * 34 ms one way, 10 to 14 ms the other -- never symmetric: a naive offset that halved the round
 * trip (or otherwise ignored the host's actual receive/send timestamps `t1`/`t2`) would carry the
 * full asymmetry as error here, not just half of it. `linkClockSampleOf`/`linkOffsetToRoom`
 * (test/link/clock.test.ts) already prove the maths in isolation; this rig proves the wiring this
 * story adds -- `setLinkOffset` feeding `toHostTime` -- holds up over the same kind of path.
 */
/** The phone's true offset to the room, drifting the way a real device clock does. */
const phoneRoomOffsetMs = (v: number) => 12_345.5 + v * 8e-6;

function createLinkRig(seed: number) {
  const time = createVirtualTime();
  const rng = createRng(seed);
  const roomEpoch = 1_789_000_000_000;
  const roomAt = (v: number) => roomEpoch + v;
  // The host already knows its own room clock offset (a different story's concern, CC-1.14) and
  // reports it as `r` on every link:pong. Non-zero and not a round number, so a test bug that
  // silently drops `r` would show up as a large, obvious error rather than passing by accident.
  const hostRoomOffsetMs = -842.25;
  const hostLocalAt = (v: number) => roomAt(v) - hostRoomOffsetMs;
  const phoneLocalAt = (v: number) => roomAt(v) - phoneRoomOffsetMs(v);

  const clock = createRoomClock({ now: () => phoneLocalAt(time.now), schedule: time.schedule });
  const forwardMs = () => 30 + rng.next() * 4;
  const returnMs = () => 10 + rng.next() * 4;

  const pingOnce = (): void => {
    const t0 = phoneLocalAt(time.now);
    time.at(time.now + forwardMs(), () => {
      const t1 = hostLocalAt(time.now);
      const t2 = t1; // the host answers at once
      time.at(time.now + returnMs(), () => {
        const t3 = phoneLocalAt(time.now);
        const sample = linkClockSampleOf({ t0, t1, t2, t3 });
        clock.setLinkOffset(linkOffsetToRoom(sample.offsetPHMs, hostRoomOffsetMs));
      });
    });
  };

  return {
    time,
    pingOnce,
    /** How far the phone's link-derived room time is from the true room time right now. */
    errorMs: () => clock.toHostTime(phoneLocalAt(time.now)) - roomAt(time.now),
  };
}

describe("link offset accuracy (CC-3.23, AC4)", () => {
  it("keeps link-derived room time within 15 ms over an asymmetric link", () => {
    const worst: number[] = [];
    for (let seed = 1; seed <= 5; seed++) {
      const rig = createLinkRig(seed);
      let seedWorst = 0;
      // 200 pings at the link's "playing" cadence (250 ms, realtime-link.md "Channels, messages
      // and rates"): 50 s of a running game.
      for (let i = 0; i < 200; i++) {
        rig.pingOnce();
        rig.time.advanceBy(250);
        seedWorst = Math.max(seedWorst, Math.abs(rig.errorMs()));
      }
      worst.push(seedWorst);
    }
    expect(Math.max(...worst)).toBeLessThan(15);
  });
});

/**
 * A phone and a room on a simulated network. The phone's clock is 3.5 s behind the room and runs
 * 20 ppm fast. The path is lopsided: a ping takes 30 to 40 ms and a pong 15 to 25 ms, so one
 * clean sample is already 2.5 to 12.5 ms off. On top of that, 1 in 20 messages each way is held
 * up another 100 to 200 ms. Messages on the socket stay in order, like a WebSocket, so a held-up
 * ping also delays the pings behind it.
 */
function createNetworkRig(seed: number) {
  const time = createVirtualTime();
  const rng = createRng(seed);
  const roomEpoch = 1_789_000_000_000;
  let localBase = roomEpoch - 3_456.789;
  let localSince = 0;
  let asleep = false;

  const roomAt = (v: number) => roomEpoch + v;
  const localAt = (v: number) => localBase + (asleep ? 0 : (v - localSince) * (1 + 20e-6));
  const trueOffset = () => roomAt(time.now) - localAt(time.now);
  const delayMs = (baseMs: number) =>
    baseMs + rng.next() * 10 + (rng.next() < 0.05 ? 100 + rng.next() * 100 : 0);

  const clock = createRoomClock({ now: () => localAt(time.now), schedule: time.schedule });
  const sampleErrors: number[] = [];
  let lastUp = 0;
  let lastDown = 0;

  const send = (ping: ClockPing) => {
    lastUp = Math.max(time.now + delayMs(30), lastUp);
    time.at(lastUp, () => {
      const pong = { ...ping, t1: Math.floor(roomAt(time.now)) };
      lastDown = Math.max(time.now + delayMs(15), lastDown);
      time.at(lastDown, () => {
        // What this one sample on its own would have said.
        sampleErrors.push(pong.t1 - (ping.t0 + localAt(time.now)) / 2 - trueOffset());
        clock.receive(pong);
      });
    });
  };

  return {
    time,
    clock,
    send,
    sampleErrors,
    /** How far `toHostTime` of the phone's current local time is from the room's real time. */
    errorMs: () => clock.toHostTime(localAt(time.now)) - roomAt(time.now),
    /** The phone locks: its local clock stops, as `performance.now()` can while asleep. */
    sleep() {
      localBase = localAt(time.now);
      asleep = true;
    },
    wake() {
      localSince = time.now;
      asleep = false;
    },
  };
}

type NetworkRig = ReturnType<typeof createNetworkRig>;

/** The largest error seen every 250 ms until `untilMs`. */
function worstErrorMs(rig: NetworkRig, untilMs: number): number {
  let worst = 0;
  while (rig.time.now < untilMs) {
    rig.time.advanceBy(250);
    worst = Math.max(worst, Math.abs(rig.errorMs()));
  }
  return worst;
}

function advanceUntilSynced(rig: NetworkRig) {
  for (let step = 0; step < 1_000 && !rig.clock.synced; step++) rig.time.advanceBy(10);
  expect(rig.clock.synced).toBe(true);
}

describe("asymmetric latency", () => {
  it("keeps the error under 15 ms from the first sync through 10 minutes, over 20 networks", () => {
    const worst: number[] = [];
    const worstSingleSample: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const rig = createNetworkRig(seed);
      rig.clock.connect(rig.send);
      advanceUntilSynced(rig);
      worst.push(Math.max(Math.abs(rig.errorMs()), worstErrorMs(rig, 10 * 60_000)));
      worstSingleSample.push(Math.max(...rig.sampleErrors.map(Math.abs)));
    }

    expect(Math.max(...worst)).toBeLessThan(15);
    // Trusting any one sample would have been far off: the filter and the median do real work.
    expect(Math.max(...worstSingleSample)).toBeGreaterThan(50);
  });

  it("is back under 15 ms after a reconnect, even though the phone's clock stopped while asleep", () => {
    const rig = createNetworkRig(42);
    rig.clock.connect(rig.send);
    advanceUntilSynced(rig);
    rig.time.advanceTo(5 * 60_000 + 10);

    // The resync ping sent at 5:00 is still on its way when the socket drops. Its pong must not count.
    rig.clock.disconnect();
    const rttBefore = rig.clock.lastRttMs;
    rig.sleep();
    rig.time.advanceBy(20_000);
    expect(rig.clock.lastRttMs).toBe(rttBefore);

    rig.wake();
    expect(Math.abs(rig.errorMs())).toBeGreaterThan(15_000);
    rig.clock.connect(rig.send);
    advanceUntilSynced(rig);

    expect(Math.abs(rig.errorMs())).toBeLessThan(15);
    expect(worstErrorMs(rig, 15 * 60_000)).toBeLessThan(15);
  });
});
