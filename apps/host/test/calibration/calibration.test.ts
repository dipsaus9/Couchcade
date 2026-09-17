import { describe, expect, it } from "vitest";
import {
  beatMs,
  createCalibration,
  flashFrameAt,
  flashMs,
  leadInMs,
  matchTap,
  matchWindowMs,
  measure,
  median,
  practiceFlashes,
  settleMs,
  totalFlashes,
} from "../../src/screens/calibration/calibration.ts";
import { createVirtualTime, lobbyWith } from "../runtime/fixtures.ts";

/** Flash draw times on a TV whose frames land exactly on the beat, from `startsAt`. */
const onBeat = (startsAt = 0) =>
  Array.from({ length: totalFlashes }, (_, index) => startsAt + index * beatMs);

/** Taps from one player at `flashAt + lagMs + errors[i]` for the counting flashes. */
function tapsAlong(
  from: string,
  flashes: readonly number[],
  lagMs: number,
  errors: readonly number[] = [0, 0, 0, 0, 0],
) {
  return errors.map((error, i) => ({
    from,
    at: flashes[practiceFlashes + i]! + lagMs + error,
  }));
}

describe("the beat", () => {
  it("is 3 practice flashes and 5 that count, 150 ms lit on a 750 ms beat, about 6 seconds", () => {
    expect(totalFlashes * beatMs).toBe(6000);
    expect(flashFrameAt(1000, 999)).toBeNull();
    expect(flashFrameAt(1000, 1000)).toEqual({ index: 0, lit: true, practice: true });
    expect(flashFrameAt(1000, 1000 + flashMs - 1)).toEqual({ index: 0, lit: true, practice: true });
    expect(flashFrameAt(1000, 1000 + flashMs)).toEqual({ index: 0, lit: false, practice: true });
    expect(flashFrameAt(1000, 1000 + 3 * beatMs + 10)).toEqual({
      index: 3,
      lit: true,
      practice: false,
    });
    expect(flashFrameAt(1000, 1000 + 7 * beatMs + 149)?.index).toBe(7);
    expect(flashFrameAt(1000, 1000 + 8 * beatMs)).toBeNull();
  });
});

describe("median", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([])).toBeNull();
    expect(median([90])).toBe(90);
    expect(median([300, 80, 90])).toBe(90);
    expect(median([100, 80, 90, 70])).toBe(85);
  });
});

describe("matchTap", () => {
  const flashes = onBeat(10_000);

  it("matches a tap to the nearest drawn counting flash and takes at - flashAt", () => {
    expect(matchTap(flashes[3]! + 80, flashes)).toEqual({ index: 3, offsetMs: 80 });
    // Tapping a little ahead of the flash is fine too.
    expect(matchTap(flashes[5]! - 20, flashes)).toEqual({ index: 5, offsetMs: -20 });
  });

  it("throws away taps more than half a beat from every flash", () => {
    expect(matchWindowMs).toBe(375);
    expect(matchTap(flashes[7]! + 375, flashes)).toEqual({ index: 7, offsetMs: 375 });
    expect(matchTap(flashes[7]! + 376, flashes)).toBeNull();
    expect(matchTap(flashes[0]! - 400, flashes)).toBeNull();
  });

  it("throws away taps on practice flashes", () => {
    expect(matchTap(flashes[2]! + 80, flashes)).toBeNull();
    expect(matchTap(flashes[0]!, flashes)).toBeNull();
  });

  it("only matches flashes that were drawn", () => {
    const hidden = flashes.map((at, i) => (i === 4 ? null : at));
    expect(matchTap(flashes[4]! + 80, hidden)).toBeNull();
  });
});

describe("measure", () => {
  const flashes = onBeat(50_000);

  it("finds the display lag from players tapping along, however late each one reacts", () => {
    // Two players who keep time with small errors on a TV with 120 ms of lag. The practice taps
    // are reactions (300+ ms after the flash they see) and don't count.
    const practice = [0, 1, 2].flatMap((i) => [
      { from: "sam", at: flashes[i]! + 120 + 320 },
      { from: "noor", at: flashes[i]! + 120 + 360 },
    ]);
    const { lagMs, players } = measure(flashes, [
      ...practice,
      ...tapsAlong("sam", flashes, 120, [-15, 10, 0, 20, -5]),
      ...tapsAlong("noor", flashes, 120, [5, -10, 30, 0, -25]),
    ]);
    expect(players.get("sam")?.lagMs).toBe(120);
    expect(players.get("noor")?.lagMs).toBe(120);
    expect(lagMs).toBe(120);
  });

  it("gives the same value for a TV with no lag and a TV with 250 ms, shifted by exactly the lag", () => {
    const errors = [12, -8, 3, -20, 6];
    const none = measure(flashes, tapsAlong("sam", flashes, 0, errors)).lagMs;
    const chromecast = measure(flashes, tapsAlong("sam", flashes, 250, errors)).lagMs;
    expect(none).toBe(3);
    expect(chromecast).toBe(253);
  });

  it("uses when the host drew each flash, not when it was due", () => {
    // Frames landed 16 ms late for every flash: taps are measured against the late frames.
    const late = flashes.map((at) => at + 16);
    const taps = tapsAlong("sam", late, 90);
    expect(measure(late, taps).lagMs).toBe(90);
    expect(measure(flashes, taps).lagMs).toBe(106);
  });

  it("ignores stray taps and counts a double tap once", () => {
    const taps = [
      ...tapsAlong("sam", flashes, 100, [0, 5, -5, 0, 10]),
      // A tap long after the last flash, and a second tap right after flash 4.
      { from: "sam", at: flashes[7]! + 500 },
      { from: "sam", at: flashes[4]! + 140 },
    ];
    const { players, lagMs } = measure(flashes, taps);
    expect([...players.get("sam")!.offsets.values()]).toEqual([100, 105, 95, 100, 110]);
    expect(lagMs).toBe(100);
    expect(players.get("sam")?.lastMs).toBe(140);
  });

  it("leaves out players with fewer than 3 matched taps and takes the median of player medians", () => {
    const taps = [
      ...tapsAlong("sam", flashes, 80),
      ...tapsAlong("noor", flashes, 90),
      ...tapsAlong("jesse", flashes, 310),
      ...tapsAlong("lotte", flashes, 0, [0, 0]),
    ];
    const { players, lagMs } = measure(flashes, taps);
    expect(players.get("lotte")?.lagMs).toBeNull();
    expect(lagMs).toBe(90);
  });

  it("has no value when nobody got 3 matched taps", () => {
    expect(measure(flashes, []).lagMs).toBeNull();
    expect(measure(flashes, tapsAlong("sam", flashes, 80, [0, 0])).lagMs).toBeNull();
  });

  it("clamps the room value to 0-400 ms", () => {
    expect(measure(flashes, tapsAlong("sam", flashes, -40)).lagMs).toBe(0);
    // One player can be at most half a beat late, so 400 ms is only reached through storage.
    expect(measure(flashes, tapsAlong("sam", flashes, 375)).lagMs).toBe(375);
  });
});

function setup(players = 3) {
  const time = createVirtualTime(1_000_000);
  const lobby = lobbyWith(players);
  const ids = lobby.players.map((player) => player.id);
  const log: string[] = [];
  const calibration = createCalibration({
    lobby: () => lobby,
    roomNow: time.now,
    schedule: time.schedule,
    onMeasured: (lagMs) => log.push(`measured ${lagMs}`),
    onSkip: () => log.push("skip"),
    onChange: () => log.push("change"),
  });
  /** Draws every frame at 60 Hz up to `until`, like the TV's animation frames. */
  let frameAt = time.now();
  const drawUntil = (until: number) => {
    for (; frameAt <= until; frameAt += 1000 / 60) calibration.frame(Math.round(frameAt));
  };
  const tap = (from: string, at: number) => calibration.tap(from, { at });
  return { time, lobby, ids, log, calibration, drawUntil, tap };
}

describe("createCalibration", () => {
  it("starts after a lead-in, records the frame that drew each flash and stores the median", () => {
    const { time, ids, log, calibration, drawUntil, tap } = setup();
    expect(calibration.status).toBe("running");
    expect(calibration.startsAt).toBe(1_000_000 + leadInMs);

    const end = calibration.startsAt + (totalFlashes - 1) * beatMs + flashMs;
    drawUntil(end);
    const measurement = calibration.measurement();
    expect(measurement.lagMs).toBeNull();

    // Flash 3 was first drawn by the frame at or after its due time.
    const flash3 = calibration.startsAt + 3 * beatMs;
    for (const [i, error] of [0, 10, -10, 5, 0].entries()) {
      const due = flash3 + i * beatMs;
      tap(ids[0]!, due + 17 + 90 + error);
      tap(ids[1]!, due + 17 + 95 + error);
    }
    expect(log).toContain("change");
    expect(calibration.measurement().lagMs).toBeGreaterThanOrEqual(90);
    expect(calibration.measurement().lagMs).toBeLessThanOrEqual(110);

    time.advance(end + settleMs - time.now() - 1);
    expect(log.filter((entry) => entry.startsWith("measured"))).toEqual([]);
    time.advance(1);
    const measured = log.filter((entry) => entry.startsWith("measured"));
    expect(measured).toHaveLength(1);
    expect(measured[0]).toBe(`measured ${calibration.measurement().lagMs}`);
  });

  it("gives every seated phone the calibration view, with the VIP marked", () => {
    const { ids, calibration } = setup();
    expect([...calibration.views()]).toEqual([
      [ids[0], { screen: "calibration", data: { vip: true, active: true } }],
      [ids[1], { screen: "calibration", data: { vip: false, active: true } }],
      [ids[2], { screen: "calibration", data: { vip: false, active: true } }],
    ]);
  });

  it("offers a retry when nobody got 3 matched taps, and runs the flashes again", () => {
    const { time, ids, log, calibration, drawUntil, tap } = setup();
    drawUntil(calibration.startsAt + totalFlashes * beatMs);
    tap(ids[0]!, calibration.startsAt + 3 * beatMs + 80);
    time.advance(10_000);
    expect(calibration.status).toBe("retry");
    expect(log.at(-1)).toBe("change");
    expect(log.some((entry) => entry.startsWith("measured"))).toBe(false);
    expect(calibration.views().get(ids[0]!)?.data).toEqual({ vip: true, active: false });
    // Taps and frames do nothing while the TV offers a retry.
    expect(calibration.frame(calibration.startsAt)).toBeNull();

    calibration.retry();
    expect(calibration.status).toBe("running");
    expect(calibration.startsAt).toBe(time.now() + leadInMs);
    expect(calibration.measurement().players.size).toBe(0);
  });

  it("skips only for the VIP's skip-calibration and never measures after a skip", () => {
    const { time, ids, log, calibration } = setup();
    calibration.action(ids[1]!, { action: "skip-calibration" });
    calibration.action(ids[0]!, { action: "start" });
    expect(log).toEqual([]);
    calibration.action(ids[0]!, { action: "skip-calibration" });
    expect(log).toEqual(["skip"]);
    time.advance(20_000);
    expect(log).toEqual(["skip"]);
    expect(time.pending).toBe(0);
  });

  it("ignores taps from phones without a seat", () => {
    const { ids, log, calibration, drawUntil, tap } = setup();
    drawUntil(calibration.startsAt + totalFlashes * beatMs);
    for (let i = 3; i < totalFlashes; i++) tap("AUDIENCE", calibration.startsAt + i * beatMs + 80);
    expect(calibration.measurement().players.size).toBe(0);
    expect(log).toEqual([]);
    expect(ids).toHaveLength(3);
  });
});
