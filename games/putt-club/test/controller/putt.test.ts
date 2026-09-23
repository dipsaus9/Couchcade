import { addSample, createPlayback } from "@couchcade/game-sdk/input";
import type { SampleTrack } from "@couchcade/game-sdk/input";
import type { InputChannel } from "@couchcade/game-sdk/contract";
import { createFakeAdapter } from "@couchcade/motion/sensors";
import { describe, expect, it } from "vitest";
import {
  createPuttController,
  shownDelayMs,
  type PuttClubMotion,
} from "../../src/controller/putt.ts";
import { inputSchema, type PuttClubInput } from "../../src/shared/input.ts";
import { createTestChannel } from "./channel.ts";
import { virtualTime } from "./clock.ts";
import { flatCalibration, puttBurst, turn } from "./motion.ts";

const calibration = flatCalibration();

function setup(path: InputChannel<PuttClubInput>["path"] = "direct") {
  const time = virtualTime();
  const { channel, sent, timestamps } = createTestChannel(path);
  const putt = createPuttController(channel);
  const adapter = createFakeAdapter();
  const motion: PuttClubMotion = { mode: "motion", adapter, calibration };
  /** Plays samples on virtual time, from now on. */
  const play = (durationMs: number, gamma: number) => {
    for (const sample of turn(time.now(), durationMs, gamma)) {
      time.advance(Math.max(0, sample.t - time.now()));
      adapter.push(sample);
    }
  };
  const swing = (durationMs: number, gamma: number) => {
    for (const sample of puttBurst(time.now(), durationMs, gamma)) {
      time.advance(Math.max(0, sample.t - time.now()));
      adapter.push(sample);
    }
  };
  return { time, sent, timestamps, putt, adapter, motion, play, swing };
}

const types = (sent: PuttClubInput[]) => sent.map((input) => input.type);
const putts = (sent: PuttClubInput[]) => sent.filter((input) => input.type === "putt");
const lines = (sent: PuttClubInput[]) => sent.filter((input) => input.type === "line");

/** Independently replays every "aim" message actually sent so far, `shownDelayMs(path)` behind
 * `t`, with the same generic `createPlayback` the TV's line uses (CC-11.10). */
function shownYaw(
  sent: readonly PuttClubInput[],
  timestamps: Map<PuttClubInput, number | undefined>,
  t: number,
  path: InputChannel<PuttClubInput>["path"] = "direct",
): number | null {
  let track: SampleTrack<[number]> = [];
  for (const input of sent) {
    if (input.type !== "aim") continue;
    const at = timestamps.get(input);
    if (at === undefined) continue;
    track = addSample(track, at, [input.payload.yaw]);
  }
  const value = createPlayback<[number]>().at(track, t, shownDelayMs(path), 0);
  return value === null ? null : round3(value[0]);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

describe("createPuttController with motion", () => {
  it("sends nothing while the phone moves before a turn is open", () => {
    const { putt, motion, sent, play } = setup();
    putt.use(motion);
    expect(putt.mode()).toBe("motion");
    play(500, 40);
    expect(sent).toEqual([]);
  });

  it("recentres at turnOpened and streams the centred aim at once", () => {
    const { putt, motion, sent, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    expect(sent).toEqual([{ type: "aim", payload: { yaw: 0, pitch: 0 } }]);
  });

  it("streams aim while the turn is open and unlocked, but not once locked", () => {
    const { putt, motion, sent, play, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    play(500, 10);
    const beforeLock = sent.length;
    expect(types(sent).filter((type) => type === "aim").length).toBeGreaterThan(1);

    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    play(500, 10);
    expect(sent.length).toBe(beforeLock + 1); // only the "line" message from lock()
  });

  it("locks with the aim the TV was shown, not the freshest live sample", () => {
    const { putt, motion, sent, timestamps, play, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    play(1000, 10); // still turning right up to the lock
    const t = time.now();
    const expected = shownYaw(sent, timestamps, t);
    expect(expected).not.toBeNull();

    putt.lock({ t, x: 0, y: 0, type: "down" });
    const line = lines(sent).at(-1);
    expect(line).toEqual({ type: "line", payload: { turn: 1, locked: true, yaw: expected } });
  });

  it("uses the relay's playback delay instead of the direct link's when the channel is on the relay", () => {
    const { putt, motion, sent, timestamps, play, time } = setup("relay");
    putt.use(motion);
    putt.turnOpened(1, time.now());
    play(1000, 10);

    const t = time.now();
    const expectedRelay = shownYaw(sent, timestamps, t, "relay");
    const expectedDirect = shownYaw(sent, timestamps, t, "direct");
    expect(expectedRelay).not.toEqual(expectedDirect);

    putt.lock({ t, x: 0, y: 0, type: "down" });
    expect(lines(sent).at(-1)).toEqual({
      type: "line",
      payload: { turn: 1, locked: true, yaw: expectedRelay },
    });
  });

  it("putts along the locked line when the swing peaks, using the swing's speed and angle", () => {
    const { putt, motion, sent, play, swing, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    play(300, 5);
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    const lockedYaw = (lines(sent).at(-1) as Extract<PuttClubInput, { type: "line" }>).payload.yaw;

    swing(300, 600); // firm putting stroke, at Putt Club's own fullPeak
    const fired = putts(sent);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ type: "putt", payload: { turn: 1, yaw: lockedYaw } });
    const payload = (fired[0] as Extract<PuttClubInput, { type: "putt" }>).payload;
    expect(payload.speed).toBeGreaterThan(0.9);
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("a swing under the 120 deg/s minPeak (lowered from the 240 package default) never fires", () => {
    const { putt, motion, sent, swing, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    swing(300, 100); // above the softest deliberate putt's floor, below Putt Club's 120
    expect(putts(sent)).toEqual([]);
  });

  it("a tap-in around 150 deg/s -- below the package's 240 default -- still fires", () => {
    const { putt, motion, sent, swing, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    swing(150, 150);
    expect(putts(sent)).toHaveLength(1);
  });

  it("a practice swing before the grip is down is free: the detector isn't listening yet", () => {
    const { putt, motion, sent, swing, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    swing(300, 600); // no lock() yet: no grip-down mark
    expect(putts(sent)).toEqual([]);
  });

  it("unlocks without swinging: sends the line unlocked, and aiming resumes", () => {
    const { putt, motion, sent, play, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    const lockedYaw = (lines(sent).at(-1) as Extract<PuttClubInput, { type: "line" }>).payload.yaw;

    putt.unlock({ t: time.now(), x: 0, y: 0, type: "up" });
    expect(lines(sent).at(-1)).toEqual({
      type: "line",
      payload: { turn: 1, locked: false, yaw: lockedYaw },
    });

    const beforeResume = sent.length;
    play(500, 20);
    expect(sent.length).toBeGreaterThan(beforeResume);
  });

  it("cancel resets the swing detector without firing, even mid-swing", () => {
    const { putt, motion, sent, adapter, play, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    play(100, 900); // mid-swing, well above minPeak, but not yet quiet

    putt.cancel({ t: time.now(), x: 0, y: 0, type: "cancel" });
    expect(putts(sent)).toEqual([]);
    expect(lines(sent).at(-1)).toMatchObject({ payload: { locked: false } });

    // A fresh lock afterwards starts a clean grip: the aborted swing above never counts.
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    for (const sample of puttBurst(time.now(), 300, 600)) adapter.push(sample);
    expect(putts(sent)).toHaveLength(1);
  });

  it("close stops streaming without a message and resets a stray grip", () => {
    const { putt, motion, sent, play, adapter, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    const before = sent.length;

    putt.close();
    for (const sample of puttBurst(time.now(), 300, 600)) adapter.push(sample);
    play(300, 20);
    expect(sent.length).toBe(before);
  });

  it("only ever sends messages the shared input schema accepts", () => {
    const { putt, motion, sent, play, swing, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    play(300, 25);
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    swing(300, 600);
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });
});

describe("createPuttController with touch", () => {
  it("uses the drag pad and swipe pad without a motion result, or with touch", () => {
    const { putt } = setup();
    expect(putt.mode()).toBe("touch");
    putt.use(undefined);
    expect(putt.mode()).toBe("touch");
    putt.use({ mode: "touch" });
    expect(putt.mode()).toBe("touch");
  });

  it("recentres the pad too, not just motion, and streams the centred aim", () => {
    const { putt, sent, time } = setup();
    putt.turnOpened(1, time.now());
    expect(sent).toEqual([{ type: "aim", payload: { yaw: 0, pitch: 0 } }]);
  });

  it("streams while the pad is dragged", () => {
    const { putt, sent, time } = setup();
    putt.turnOpened(1, time.now());
    let t = time.now();
    putt.pad({ t, x: 100, y: 300, type: "down" });
    for (let i = 1; i <= 10; i++) {
      t += 16;
      putt.pad({ t, x: 100 + i * 4, y: 300, type: "move" });
    }
    putt.pad({ t, x: 140, y: 300, type: "up" });
    expect(sent.filter((input) => input.type === "aim").length).toBeGreaterThan(1);
    expect(sent.at(-1)).toMatchObject({ type: "aim" });
  });

  it("the Centre button forces the recentred aim out at once, so a lock right after still uses it", () => {
    const { putt, sent, time } = setup();
    putt.turnOpened(1, time.now());
    const t0 = time.now();
    putt.pad({ t: t0, x: 100, y: 100, type: "down" });
    putt.pad({ t: t0 + 16, x: 200, y: 100, type: "move" });
    putt.pad({ t: t0 + 32, x: 200, y: 100, type: "up" });
    expect(sent.at(-1)).not.toEqual({ type: "aim", payload: { yaw: 0, pitch: 0 } });

    putt.centre(t0 + 100);
    expect(sent.at(-1)).toEqual({ type: "aim", payload: { yaw: 0, pitch: 0 } });

    // Without another drag, lock's playback must still see the Centre press, not a stale sample.
    putt.lock({ t: t0 + 200, x: 0, y: 0, type: "down" });
    const line = lines(sent).at(-1);
    expect(line).toEqual({ type: "line", payload: { turn: 1, locked: true, yaw: 0 } });
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("touching the big action locks with the aim the TV was shown", () => {
    const { putt, sent, timestamps, time } = setup();
    putt.turnOpened(1, time.now());
    const t0 = time.now();
    putt.pad({ t: t0, x: 100, y: 100, type: "down" });
    putt.pad({ t: t0 + 16, x: 200, y: 100, type: "move" });
    putt.pad({ t: t0 + 32, x: 200, y: 100, type: "up" });

    const t = t0 + 200;
    const expected = shownYaw(sent, timestamps, t);
    putt.lock({ t, x: 0, y: 0, type: "down" });
    expect(lines(sent).at(-1)).toEqual({
      type: "line",
      payload: { turn: 1, locked: true, yaw: expected },
    });
  });

  it("a swipe of at least 60px up putts, from 300 px/s (0) to 2400 px/s (1)", () => {
    const { putt, sent, time } = setup();
    putt.turnOpened(1, time.now());
    const t0 = time.now();
    putt.lock({ t: t0, x: 100, y: 300, type: "down" });
    // 70 px up in ~50 ms: well past minSwipePx and a brisk, near-full-power swipe.
    putt.swipe({ t: t0 + 50, x: 100, y: 230, type: "move" });
    putt.swipe({ t: t0 + 60, x: 100, y: 225, type: "up" });

    const fired = putts(sent);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ type: "putt", payload: { turn: 1 } });
    const payload = (fired[0] as Extract<PuttClubInput, { type: "putt" }>).payload;
    expect(payload.speed).toBeGreaterThan(0);
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });

  it("a short swipe unlocks instead: 'unlock' is a safe no-op once a putt already sent", () => {
    const { putt, sent, time } = setup();
    putt.turnOpened(1, time.now());
    const t0 = time.now();
    putt.lock({ t: t0, x: 100, y: 300, type: "down" });
    putt.swipe({ t: t0 + 50, x: 100, y: 290, type: "up" }); // 10 px: short of the 60 px floor
    expect(putts(sent)).toEqual([]);

    putt.unlock({ t: t0 + 50, x: 100, y: 290, type: "up" });
    expect(lines(sent).at(-1)).toMatchObject({ payload: { locked: false } });
  });

  it("switches to touch when motion stops mid-match, and stops reading the sensors", () => {
    const { putt, motion, sent, play, time } = setup();
    putt.use(motion);
    putt.turnOpened(1, time.now());
    putt.use({ mode: "touch" });
    expect(putt.mode()).toBe("touch");
    play(500, 40);
    // Only the recentred aim from turnOpened and the mode switch's own state -- no live samples.
    expect(sent.filter((input) => input.type === "aim")).toHaveLength(1);
  });
});

describe("createPuttController's messages", () => {
  it("close() before any use() is a safe no-op", () => {
    const { putt } = setup();
    expect(() => putt.close()).not.toThrow();
  });

  it("notifies listeners of every local phase change", () => {
    const { putt, time } = setup();
    const phases: string[] = [];
    putt.on((phase) => phases.push(phase));
    putt.turnOpened(1, time.now());
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    putt.unlock({ t: time.now(), x: 0, y: 0, type: "up" });
    expect(phases).toEqual(["locked", "unlockedEarly"]);
  });

  it("a listener can unsubscribe", () => {
    const { putt, time } = setup();
    let count = 0;
    const stop = putt.on(() => count++);
    stop();
    putt.turnOpened(1, time.now());
    putt.lock({ t: time.now(), x: 0, y: 0, type: "down" });
    expect(count).toBe(0);
  });
});
