import { addSample, createPlayback } from "@couchcade/game-sdk/input";
import type { SampleTrack } from "@couchcade/game-sdk/input";
import type { InputChannel } from "@couchcade/game-sdk/contract";
import { createFakeAdapter } from "@couchcade/motion/sensors";
import { describe, expect, it } from "vitest";
import { createShotAim, shownDelayMs, type TargetRangeMotion } from "../../src/controller/aim.ts";
import { inputSchema, type TargetRangeInput } from "../../src/shared/input.ts";
import { createTestChannel } from "./channel.ts";
import { virtualTime } from "./clock.ts";
import { flatCalibration, turn } from "./motion.ts";

const calibration = flatCalibration();

function setup(path: InputChannel<TargetRangeInput>["path"] = "direct") {
  const time = virtualTime();
  const { channel, sent, timestamps } = createTestChannel(path);
  const aim = createShotAim(channel);
  const adapter = createFakeAdapter();
  const motion: TargetRangeMotion = { mode: "motion", adapter, calibration };
  /** Plays samples on virtual time, from now on. */
  const play = (durationMs: number, gamma: number) => {
    for (const sample of turn(time.now(), durationMs, gamma)) {
      time.advance(Math.max(0, sample.t - time.now()));
      adapter.push(sample);
    }
  };
  return { time, sent, timestamps, aim, adapter, motion, play };
}

const types = (sent: TargetRangeInput[]) => sent.map((input) => input.type);

/**
 * Independently replays every "aim" message actually sent so far, `shownDelayMs(path)` behind `t`,
 * with the same generic `createPlayback` the TV's crosshair uses (CC-11.10). This is the expected
 * `shoot` aim: what the TV was showing at release, not the freshest live sample.
 */
function shownAim(
  sent: readonly TargetRangeInput[],
  timestamps: Map<TargetRangeInput, number | undefined>,
  t: number,
  path: InputChannel<TargetRangeInput>["path"] = "direct",
): { yaw: number; pitch: number } | null {
  let track: SampleTrack<[number, number]> = [];
  for (const input of sent) {
    if (input.type !== "aim") continue;
    const at = timestamps.get(input);
    if (at === undefined) continue;
    track = addSample(track, at, [input.payload.yaw, input.payload.pitch]);
  }
  const value = createPlayback<[number, number]>().at(track, t, shownDelayMs(path), 0);
  return value === null ? null : { yaw: round3(value[0]), pitch: round3(value[1]) };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

describe("createShotAim with motion", () => {
  it("sends nothing while the phone moves without a draw", () => {
    const { aim, motion, sent, play } = setup();
    aim.use(motion);
    expect(aim.mode()).toBe("motion");
    play(500, 40);
    expect(sent).toEqual([]);
  });

  it("recentres at the draw and sends the centre sample at once", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    play(500, 40);
    expect(aim.aim().yaw).not.toBe(0);

    aim.startDraw(time.now());
    expect(aim.aim()).toEqual({ yaw: 0, pitch: 0 });
    expect(sent).toEqual([{ type: "aim", payload: { yaw: 0, pitch: 0 } }]);
  });

  it("streams aim while drawing and shoots with the aim the TV was shown, not the freshest live sample", () => {
    const { aim, motion, sent, timestamps, play, time } = setup();
    aim.use(motion);
    play(200, 0);
    aim.startDraw(time.now());
    play(1000, 10); // still turning right up to release
    const live = aim.aim();
    expect(Math.abs(live.yaw)).toBeGreaterThan(0.2);
    expect(types(sent).filter((type) => type === "aim").length).toBeGreaterThan(2);

    const before = sent.length;
    const t = time.now();
    // CC-11.10: while still moving, the TV's delayed/interpolated crosshair lags the phone's own
    // freshest live sample -- the shot must carry the delayed value, not `live`.
    const expected = shownAim(sent, timestamps, t);
    expect(expected).not.toBeNull();
    expect(expected).not.toEqual(live);

    aim.shoot(3, 0.8, t);
    time.advance(300);
    expect(sent.slice(before)).toEqual([
      { type: "shoot", payload: { volley: 3, aim: expected, power: 0.8 } },
    ]);

    play(1000, 30);
    expect(sent.length).toBe(before + 1);
  });

  it("uses the relay's playback delay instead of the direct link's when the channel is on the relay", () => {
    // CC-11.10: the TV renders a relay-path player's crosshair much further behind (180 ms,
    // relayPlaybackDelayMs) than a direct-path one (~33 ms, directPlaybackDelayMs at 30 Hz) --
    // `shoot` must pick the delay that matches `channel.path`, not a single fixed guess.
    const { aim, motion, sent, timestamps, play, time } = setup("relay");
    aim.use(motion);
    play(200, 0);
    aim.startDraw(time.now());
    play(1000, 10);

    const t = time.now();
    const expectedRelay = shownAim(sent, timestamps, t, "relay");
    const expectedDirect = shownAim(sent, timestamps, t, "direct");
    expect(expectedRelay).not.toEqual(expectedDirect);

    aim.shoot(3, 0.8, t);
    const shot = sent.at(-1);
    expect(shot).toEqual({
      type: "shoot",
      payload: { volley: 3, aim: expectedRelay, power: 0.8 },
    });
  });

  it("lowers the bow, and the next draw shows the crosshair again from the centre", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    aim.startDraw(time.now());
    aim.lower(1, time.now());
    time.advance(300);
    expect(sent).toEqual([
      { type: "aim", payload: { yaw: 0, pitch: 0 } },
      { type: "lower", payload: { volley: 1 } },
    ]);

    play(300, 0);
    aim.startDraw(time.now());
    time.advance(300);
    expect(sent.at(-1)).toEqual({ type: "aim", payload: { yaw: 0, pitch: 0 } });
    expect(sent).toHaveLength(3);
  });

  it("stops a draw when the volley closes without a message", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    aim.startDraw(time.now());
    aim.stop();
    play(1000, 30);
    time.advance(1000);
    expect(sent).toHaveLength(1);
  });

  it("keeps motion aim when the same result comes again, and ignores the pad", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    play(500, 40);
    const turned = aim.aim();
    aim.use({ ...motion });
    expect(aim.aim()).toEqual(turned);
    aim.pad({ t: time.now(), x: 0, y: 0, type: "down" });
    aim.centre(time.now());
    expect(aim.aim()).toEqual(turned);
    expect(sent).toEqual([]);
  });

  it("volleys that open send nothing for motion", () => {
    const { aim, motion, sent, time } = setup();
    aim.use(motion);
    aim.volleyOpened(time.now());
    expect(sent).toEqual([]);
  });
});

describe("createShotAim with touch", () => {
  it("uses the drag pad without a motion result, or with touch", () => {
    const { aim } = setup();
    expect(aim.mode()).toBe("touch");
    aim.use(undefined);
    expect(aim.mode()).toBe("touch");
    aim.use({ mode: "touch" });
    expect(aim.mode()).toBe("touch");
  });

  it("switches to touch when motion stops mid-game, and stops reading the sensors", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    aim.use({ mode: "touch" });
    expect(aim.mode()).toBe("touch");
    aim.startDraw(time.now());
    play(1000, 40);
    expect(aim.aim()).toEqual({ yaw: 0, pitch: 0 });
    expect(sent).toHaveLength(1);
  });

  it("sends the current aim when a volley opens, so the crosshair shows", () => {
    const { aim, sent, time } = setup();
    aim.volleyOpened(time.now());
    expect(sent).toEqual([{ type: "aim", payload: { yaw: 0, pitch: 0 } }]);
  });

  it("streams while the pad is dragged, then stops", () => {
    const { aim, sent, time } = setup();
    let t = time.now();
    aim.pad({ t, x: 100, y: 300, type: "down" });
    expect(sent).toHaveLength(1);
    for (let i = 1; i <= 30; i++) {
      time.advance(16);
      t = time.now();
      aim.pad({ t, x: 100 + i * 2, y: 300 - i, type: "move" });
    }
    aim.pad({ t, x: 160, y: 270, type: "up" });
    time.advance(500);
    // padPxPerCssPx = 1.5: 60 px right is 0.45 of yaw, 30 px up is 0.5 of pitch.
    expect(aim.aim()).toEqual({ yaw: 0.45, pitch: 0.5 });
    const count = sent.length;
    expect(count).toBeGreaterThan(1);
    expect(sent.at(-1)).toMatchObject({ type: "aim" });

    aim.centre(time.now());
    time.advance(500);
    expect(aim.aim()).toEqual({ yaw: 0, pitch: 0 });
    expect(sent).toHaveLength(count);
  });

  it("doesn't recentre at the draw, so the shot carries the pad's aim", () => {
    const { aim, sent, timestamps, time } = setup();
    aim.pad({ t: time.now(), x: 0, y: 0, type: "down" });
    aim.pad({ t: time.now() + 16, x: -50, y: 0, type: "move" });
    aim.pad({ t: time.now() + 32, x: -50, y: 0, type: "up" });
    time.advance(300);
    aim.startDraw(time.now());
    expect(aim.aim()).toEqual({ yaw: -0.375, pitch: 0 });
    time.advance(300);
    const t = time.now();
    // CC-11.10: the shot carries the TV's shown aim, replayed the same way `aim-playback.ts`
    // would render this same sparse track, not simply the pad's steady live reading.
    const expected = shownAim(sent, timestamps, t);
    aim.shoot(2, 1, t);
    time.advance(300);
    expect(sent.at(-1)).toEqual({
      type: "shoot",
      payload: { volley: 2, aim: expected, power: 1 },
    });
  });
});

describe("createShotAim's messages", () => {
  it("only ever sends messages the shared input schema accepts", () => {
    const { aim, motion, sent, play, time } = setup();
    aim.use(motion);
    aim.startDraw(time.now());
    play(500, 25);
    aim.shoot(1, 1, time.now());
    for (const input of sent) expect(inputSchema.safeParse(input).success).toBe(true);
  });
});
