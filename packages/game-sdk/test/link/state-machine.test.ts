import { describe, expect, it } from "vitest";
import {
  attemptWindowMs,
  connectTimeoutMs,
  createLinkStateMachine,
  maxAttemptsPerHour,
  minStaleAfterMs,
  retryBackoffMs,
  staleToRelayMs,
} from "@couchcade/game-sdk/link";
import { createVirtualTime } from "../clock/virtual-time.ts";

function createRig(pingIntervalMs?: number) {
  const time = createVirtualTime();
  const link = createLinkStateMachine({
    now: () => time.now,
    schedule: time.schedule,
    ...(pingIntervalMs === undefined ? {} : { pingIntervalMs }),
  });
  const states: string[] = [];
  link.onChange((state) => states.push(state));
  return { time, link, states };
}

/** Drives a rig from `off` to `direct`: start, then both channels open and 3 pongs. */
function goDirect(rig: ReturnType<typeof createRig>): void {
  rig.link.start();
  rig.link.channelsOpen();
  rig.link.pong();
  rig.link.pong();
  rig.link.pong();
}

describe("off -> connecting -> direct", () => {
  it("starts in off and promotes once both channels are open and 3 pongs arrived", () => {
    const rig = createRig();
    expect(rig.link.state).toBe("off");
    rig.link.start();
    expect(rig.link.state).toBe("connecting");
    rig.link.pong();
    rig.link.pong();
    expect(rig.link.state).toBe("connecting"); // channels not open yet
    rig.link.channelsOpen();
    expect(rig.link.state).toBe("connecting"); // only 2 pongs so far
    rig.link.pong();
    expect(rig.link.state).toBe("direct");
  });

  it("promotes as soon as the later of the two conditions is met, in either order", () => {
    const rig = createRig();
    rig.link.start();
    rig.link.channelsOpen();
    rig.link.pong();
    rig.link.pong();
    rig.link.pong();
    expect(rig.link.state).toBe("direct");
  });

  it("is a no-op from any state but off", () => {
    const rig = createRig();
    rig.link.start();
    rig.link.start();
    expect(rig.states.filter((s) => s === "connecting")).toHaveLength(1);
  });
});

describe("connect timeout", () => {
  it("falls back to relay after 5 s with no link", () => {
    expect(connectTimeoutMs).toBe(5_000);
    const rig = createRig();
    rig.link.start();
    rig.time.advanceBy(connectTimeoutMs - 1);
    expect(rig.link.state).toBe("connecting");
    rig.time.advanceBy(1);
    expect(rig.link.state).toBe("relay");
  });

  it("goes to relay at once when the description is refused, without waiting 5 s", () => {
    const rig = createRig();
    rig.link.start();
    rig.time.advanceBy(1_000);
    rig.link.descriptionRefused();
    expect(rig.link.state).toBe("relay");
  });
});

describe("stale and back to direct or relay", () => {
  it("goes stale after 3 missed pongs, at least 750 ms, then back to direct on a pong", () => {
    expect(minStaleAfterMs).toBe(750);
    const rig = createRig(); // default 250 ms ping interval: stale after 750 ms
    goDirect(rig);
    expect(rig.link.state).toBe("direct");

    rig.time.advanceBy(749);
    expect(rig.link.state).toBe("direct");
    rig.time.advanceBy(1);
    expect(rig.link.state).toBe("stale");

    rig.link.pong();
    expect(rig.link.state).toBe("direct");
  });

  it("floors the stale timeout at 750 ms even with a slower ping interval configured", () => {
    const rig = createRig(2_000); // "otherwise", 1,000 ms in the doc; use 2,000 to prove the floor doesn't apply
    goDirect(rig);
    rig.time.advanceBy(3 * 2_000 - 1);
    expect(rig.link.state).toBe("direct");
    rig.time.advanceBy(1);
    expect(rig.link.state).toBe("stale");
  });

  it("falls back to relay after 5 s stale", () => {
    expect(staleToRelayMs).toBe(5_000);
    const rig = createRig();
    goDirect(rig);
    rig.time.advanceBy(750); // -> stale
    expect(rig.link.state).toBe("stale");
    rig.time.advanceBy(staleToRelayMs - 1);
    expect(rig.link.state).toBe("stale");
    rig.time.advanceBy(1);
    expect(rig.link.state).toBe("relay");
  });

  it("goes to relay at once when the connection closes, from direct or stale", () => {
    const direct = createRig();
    goDirect(direct);
    direct.link.connectionClosed();
    expect(direct.link.state).toBe("relay");

    const stale = createRig();
    goDirect(stale);
    stale.time.advanceBy(750);
    expect(stale.link.state).toBe("stale");
    stale.link.connectionClosed();
    expect(stale.link.state).toBe("relay");
  });
});

describe("retry backoff", () => {
  it("retries automatically at 10 s, 30 s, then 90 s, then stops auto-retrying", () => {
    expect(retryBackoffMs).toEqual([10_000, 30_000, 90_000]);
    const rig = createRig();
    rig.link.start();
    rig.link.descriptionRefused(); // -> relay, schedules the first retry at 10 s

    rig.time.advanceBy(10_000 - 1);
    expect(rig.link.state).toBe("relay");
    rig.time.advanceBy(1);
    expect(rig.link.state).toBe("connecting"); // 1st auto retry

    rig.link.descriptionRefused(); // fails again -> relay, schedules the 30 s retry
    rig.time.advanceBy(30_000);
    expect(rig.link.state).toBe("connecting"); // 2nd auto retry

    rig.link.descriptionRefused(); // fails again -> relay, schedules the 90 s retry
    rig.time.advanceBy(90_000);
    expect(rig.link.state).toBe("connecting"); // 3rd auto retry

    rig.link.descriptionRefused(); // fails a 4th time: no more auto-retries are scheduled
    rig.time.advanceBy(10 * 60_000);
    expect(rig.link.state).toBe("relay");
    expect(rig.time.pending).toBe(0);
  });

  it("retries on a trigger even while an auto-retry timer is still pending", () => {
    const rig = createRig();
    rig.link.start();
    rig.link.descriptionRefused();
    rig.time.advanceBy(1_000); // well inside the 10 s auto-retry wait

    rig.link.retry();
    expect(rig.link.state).toBe("connecting");
  });

  it("resets the backoff after a successful connection", () => {
    const rig = createRig();
    rig.link.start();
    rig.link.descriptionRefused(); // 1st failure, schedules 10 s
    rig.time.advanceBy(10_000);
    expect(rig.link.state).toBe("connecting");

    goDirect(rig); // succeeds this time, resetting the backoff
    rig.link.connectionClosed(); // fails again: backoff restarts at 10 s, not 30 s
    rig.time.advanceBy(10_000 - 1);
    expect(rig.link.state).toBe("relay");
    rig.time.advanceBy(1);
    expect(rig.link.state).toBe("connecting");
  });

  it("retry() is a no-op outside relay", () => {
    const rig = createRig();
    rig.link.retry();
    expect(rig.link.state).toBe("off");
  });
});

describe("the hourly attempt budget", () => {
  it("allows at most 10 attempts, of any kind, per rolling hour", () => {
    expect(maxAttemptsPerHour).toBe(10);
    const rig = createRig();

    // 9 attempts via explicit retries, spread out so none is blocked by anything but the budget.
    rig.link.start();
    for (let attempt = 2; attempt <= 10; attempt++) {
      rig.link.descriptionRefused();
      rig.link.retry();
      expect(rig.link.state).toBe("connecting");
    }
    expect(rig.states.filter((s) => s === "connecting")).toHaveLength(10);

    // The 11th attempt is refused: state stays in relay.
    rig.link.descriptionRefused();
    rig.link.retry();
    expect(rig.link.state).toBe("relay");
  });

  it("allows attempts again once the oldest ones age out of the hour", () => {
    const rig = createRig();
    rig.link.start();
    for (let attempt = 2; attempt <= 10; attempt++) {
      rig.link.descriptionRefused();
      rig.link.retry();
    }
    rig.link.descriptionRefused();
    rig.link.retry();
    expect(rig.link.state).toBe("relay"); // 11th blocked

    rig.time.advanceBy(attemptWindowMs + 1);
    rig.link.retry();
    expect(rig.link.state).toBe("connecting");
  });
});

describe("stop", () => {
  it("goes to off from connecting, direct, stale and relay, cancelling every timer", () => {
    for (const setup of [
      (rig: ReturnType<typeof createRig>) => rig.link.start(),
      (rig: ReturnType<typeof createRig>) => goDirect(rig),
      (rig: ReturnType<typeof createRig>) => {
        goDirect(rig);
        rig.time.advanceBy(750);
      },
      (rig: ReturnType<typeof createRig>) => {
        rig.link.start();
        rig.link.descriptionRefused();
      },
    ]) {
      const rig = createRig();
      setup(rig);
      rig.link.stop();
      expect(rig.link.state).toBe("off");
      expect(rig.time.pending).toBe(0);
    }
  });

  it("a stray pong after stop does nothing", () => {
    const rig = createRig();
    goDirect(rig);
    rig.link.stop();
    rig.link.pong();
    expect(rig.link.state).toBe("off");
  });
});

describe("onChange", () => {
  it("unsubscribes", () => {
    const rig = createRig();
    const seen: string[] = [];
    const unsubscribe = rig.link.onChange((state) => seen.push(state));
    rig.link.start();
    unsubscribe();
    rig.link.descriptionRefused();
    expect(seen).toEqual(["connecting"]);
  });
});
