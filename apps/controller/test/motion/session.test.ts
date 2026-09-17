import { createFakeAdapter, type MotionCapability } from "@couchcade/motion/sensors";
import type { MotionSample } from "@couchcade/motion/sensors";
import type { ControllerView, PlayerInfo, PhoneToRelayMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import {
  createMotionSession,
  motionStallMs,
  stillGiveUpMs,
  type MotionDocument,
} from "../../src/motion/session.ts";
import type { PhoneState } from "../../src/session/state.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const you: PlayerInfo = {
  id: "ABCDEFGH",
  name: "Noor",
  slot: 0,
  profile: { skin: 0, hair: 0, hairColour: 0 },
  joinedAt: 1,
  connected: true,
};

function room(gameId: string | null, view: ControllerView | null): PhoneState {
  return {
    status: "room",
    session: { code: "BEAN", playerId: you.id, rejoinToken: "r" },
    you,
    role: "player",
    phase: gameId === null ? "motion-check" : "playing",
    hostConnected: true,
    online: true,
    gameId,
    view,
  };
}

const step = (n = 1) =>
  room(null, { screen: "motion-permission", data: { gameId: "swing", title: "Swing", step: n } });
const playing = room("swing", { screen: "aim", data: null });
const results = room(null, { screen: "results", data: { title: "Swing" } });

/** Virtual time: `now` and a scheduler that only move when the test advances them. */
function virtualTime() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    schedule: (callback: () => void, delayMs: number) => {
      const key = id++;
      timers.set(key, { at: now + delayMs, callback });
      return () => void timers.delete(key);
    },
    get pending() {
      return timers.size;
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers]
          .filter(([, t]) => t.at <= end)
          .toSorted((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = end;
    },
  };
}

function fakeDocument() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible",
    addEventListener: (_: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => void listeners.delete(listener),
  };
  const set = (visibility: "visible" | "hidden") => {
    doc.visibilityState = visibility;
    for (const listener of listeners) listener();
  };
  return { doc: doc as MotionDocument, set, listeners };
}

const still = (t: number): MotionSample => ({
  t,
  interval: 16,
  acceleration: { x: 0, y: 0, z: 0 },
  gravityAcceleration: { x: 0, y: 6.9, z: 6.9 },
  rotationRate: { alpha: 0.5, beta: 0, gamma: 0 },
});

function setup({ capability = "full" as MotionCapability, needsGyroscope = true } = {}) {
  const time = virtualTime();
  const adapter = createFakeAdapter({ now: time.now });
  const sent: PhoneToRelayMessage[] = [];
  const log: string[] = [];
  const { doc, set, listeners } = fakeDocument();
  const motion = createMotionSession({
    adapter: () => adapter,
    send: (message) => sent.push(message),
    keepAwake: () => log.push("wake lock"),
    enterFullscreen: () => log.push("fullscreen"),
    exitFullscreen: () => log.push("exit fullscreen"),
    needsGyroscope,
    document: doc,
    schedule: time.schedule,
    now: time.now,
    waitForData: () => Promise.resolve(capability),
  });
  /** Pushes still samples, one every 16 ms, for `ms`. */
  const holdStill = (ms: number) => {
    const start = time.now();
    for (let t = 0; t <= ms; t += 16) {
      time.advance(t === 0 ? 0 : 16);
      adapter.push(still(start + t));
    }
  };
  const statuses = () =>
    sent.flatMap((message) => (message.t === "motion:status" ? [message.d.status] : []));
  return { time, adapter, sent, log, motion, holdStill, statuses, setVisibility: set, listeners };
}

describe("createMotionSession", () => {
  it("starts a step on the motion permission view and keeps it through a re-sent view", () => {
    const { motion } = setup();
    motion.follow(step());
    expect(motion.state.value).toMatchObject({
      gameId: "swing",
      title: "Swing",
      step: 1,
      flow: { kind: "ask" },
      playing: false,
      paused: false,
    });
    motion.useTouch();
    motion.follow(step());
    expect(motion.state.value?.flow.kind).toBe("touch");
    // "Play again" is a new step.
    motion.follow(step(2));
    expect(motion.state.value?.flow).toEqual({ kind: "ask" });
  });

  it("enable: asks in the tap, renews the wake lock, calibrates and tells the host granted", async () => {
    const { motion, log, holdStill, statuses, adapter } = setup();
    let requested = 0;
    const request = adapter.request;
    adapter.request = () => {
      requested += 1;
      return request();
    };
    motion.follow(step());
    motion.enable();
    // The browser was asked synchronously, inside the tap.
    expect(requested).toBe(1);
    expect(log).toEqual(["wake lock", "fullscreen"]);
    expect(motion.state.value?.flow).toEqual({ kind: "starting" });
    await flush();
    expect(motion.state.value?.flow).toEqual({ kind: "still", progress: 0 });

    holdStill(500);
    const flow = motion.state.value?.flow;
    expect(flow?.kind === "still" && flow.progress).toBeGreaterThan(0.3);
    expect(statuses()).toEqual([]);
    holdStill(600);
    expect(motion.state.value?.flow).toEqual({ kind: "ready" });
    expect(motion.state.value?.calibration?.up.z).toBeCloseTo(Math.SQRT1_2, 1);
    expect(motion.state.value?.capability).toBe("full");
    expect(statuses()).toEqual(["granted"]);
    // A second tap does nothing.
    motion.enable();
    expect(requested).toBe(1);
  });

  it("a browser that says no, or has no sensors, switches to touch and tells the host", async () => {
    const denied = setup();
    denied.adapter.setPermission("denied");
    denied.motion.follow(step());
    denied.motion.enable();
    await flush();
    expect(denied.motion.state.value?.flow).toEqual({
      kind: "touch",
      reason: "denied",
      acknowledged: false,
    });
    expect(denied.statuses()).toEqual(["denied"]);
    denied.motion.acknowledge();
    expect(denied.motion.state.value?.flow).toMatchObject({ kind: "touch", acknowledged: true });

    const unsupported = setup();
    unsupported.adapter.setPermission("unsupported");
    unsupported.motion.follow(step());
    unsupported.motion.enable();
    await flush();
    expect(unsupported.statuses()).toEqual(["unsupported"]);

    const noData = setup({ capability: "none" });
    noData.motion.follow(step());
    noData.motion.enable();
    await flush();
    expect(noData.statuses()).toEqual(["unsupported"]);
  });

  it("an accelerometer-only phone plays with touch when the game needs the gyroscope", async () => {
    const gyro = setup({ capability: "accelerometer" });
    gyro.motion.follow(step());
    gyro.motion.enable();
    await flush();
    expect(gyro.statuses()).toEqual(["unsupported"]);

    const tilt = setup({ capability: "accelerometer", needsGyroscope: false });
    tilt.motion.follow(step());
    tilt.motion.enable();
    await flush();
    expect(tilt.motion.state.value?.flow.kind).toBe("still");
  });

  it("Use touch instead answers denied without asking the browser", () => {
    const { motion, statuses, log } = setup();
    motion.follow(step());
    motion.useTouch();
    expect(statuses()).toEqual(["denied"]);
    expect(log).toEqual([]);
    expect(motion.state.value?.flow).toMatchObject({ kind: "touch", reason: "denied" });
  });

  it("gives up on calibration with touch when samples stop coming", async () => {
    const { motion, time, statuses, holdStill } = setup();
    motion.follow(step());
    motion.enable();
    await flush();
    holdStill(200);
    time.advance(stillGiveUpMs);
    expect(statuses()).toEqual(["unsupported"]);
    expect(time.pending).toBe(0);
  });

  it("asks again when the page is hidden during calibration", async () => {
    const { motion, setVisibility, holdStill, statuses } = setup();
    motion.follow(step());
    motion.enable();
    await flush();
    setVisibility("hidden");
    expect(motion.state.value?.flow).toEqual({ kind: "ask" });
    setVisibility("visible");
    holdStill(1100);
    expect(statuses()).toEqual([]);
  });

  /** A phone with motion on, in the running game. */
  async function inGame() {
    const context = setup();
    context.motion.follow(step());
    context.motion.enable();
    await flush();
    context.holdStill(1100);
    context.motion.follow(playing);
    expect(context.motion.state.value?.playing).toBe(true);
    return context;
  }

  it("shows Tap to resume after the page was hidden, and the tap restarts sensors and wake lock", async () => {
    const { motion, setVisibility, log, time, holdStill, statuses } = await inGame();
    const calibration = motion.state.value?.calibration;
    setVisibility("hidden");
    expect(motion.state.value?.paused).toBe(true);
    // No stall while hidden or paused.
    time.advance(motionStallMs * 3);
    setVisibility("visible");
    time.advance(motionStallMs * 3);
    expect(motion.state.value?.paused).toBe(true);
    expect(statuses()).toEqual(["granted"]);

    log.length = 0;
    motion.resume();
    expect(log).toEqual(["wake lock", "fullscreen"]);
    await flush();
    expect(motion.state.value?.paused).toBe(false);
    // The calibration from before the sleep is kept.
    expect(motion.state.value?.calibration).toBe(calibration);
    holdStill(motionStallMs * 2);
    expect(statuses()).toEqual(["granted"]);
  });

  it("a resume tap the browser refuses switches to touch", async () => {
    const { motion, setVisibility, adapter, statuses } = await inGame();
    setVisibility("hidden");
    setVisibility("visible");
    adapter.setPermission("denied");
    motion.resume();
    await flush();
    expect(motion.state.value).toMatchObject({ paused: false, flow: { kind: "touch" } });
    expect(statuses()).toEqual(["granted", "denied"]);
  });

  it("switches to touch when no sample arrives for 2 s during the game", async () => {
    const { motion, time, adapter, statuses } = await inGame();
    time.advance(motionStallMs - 500);
    adapter.push(still(time.now()));
    time.advance(motionStallMs - 500);
    expect(statuses()).toEqual(["granted"]);
    time.advance(1000);
    expect(statuses()).toEqual(["granted", "unsupported"]);
    expect(motion.state.value?.flow).toMatchObject({ kind: "touch", reason: "unsupported" });
    expect(time.pending).toBe(0);
  });

  it("a phone still deciding when the game starts plays with touch, without another message", () => {
    const { motion, statuses } = setup();
    motion.follow(step());
    motion.follow(playing);
    expect(motion.state.value?.flow).toMatchObject({ kind: "touch", acknowledged: true });
    expect(statuses()).toEqual([]);
  });

  it("ends when the game is over: leaves fullscreen and stops listening", async () => {
    const { motion, log, listeners, time } = await inGame();
    motion.follow(room("swing", null));
    expect(motion.state.value).not.toBeNull();
    motion.follow(results);
    expect(motion.state.value).toBeNull();
    expect(log.at(-1)).toBe("exit fullscreen");
    expect(listeners.size).toBe(0);
    expect(time.pending).toBe(0);
    motion.follow({
      status: "join",
      draft: { code: "", name: "", codeFromUrl: false },
      submitting: false,
      notice: null,
    });
    expect(motion.state.value).toBeNull();
  });
});
