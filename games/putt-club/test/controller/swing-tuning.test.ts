/**
 * Checks Putt Club's lowered swing detector (`minPeak: 120, fullPeak: 600, startRate: 70, endRate:
 * 40`, `putt.ts`) against a softer, shorter stroke than the package's bowling-arm defaults were
 * tuned for (docs/games/putt-club.md, "Why minPeak and fullPeak come down", and finding 3).
 *
 * No real recorded putting-stroke trace exists yet under `packages/motion/test/traces/` -- the
 * owner's `pnpm trace:record` pass (CC-5.9) is still to do. These are synthetic stand-ins built the
 * same way `controller/putt.test.ts` builds its motion samples (`turning()`, `puttBurst()`,
 * `flatCalibration()`): a brisk wrist-only tap-in and a firmer full-arm-ish putt. The numbers below
 * are reported, not asserted against a specific owner target (there isn't one yet for Putt Club),
 * so a real trace can replace these without this file lying about being validated.
 */
import { describe, expect, it } from "vitest";
import { createPoseTracker } from "@couchcade/motion/calibration";
import { createSwingDetector, type Swing } from "@couchcade/motion/gestures";
import { flatCalibration, puttBurst } from "./motion.ts";

// Mirrors putt.ts's own tuning so a change to one is caught by the other drifting.
const minPeak = 120;
const fullPeak = 600;
const startRate = 70;
const endRate = 40;

function replay(gamma: number, durationMs = 200): Swing[] {
  const tracker = createPoseTracker(flatCalibration());
  const detector = createSwingDetector({
    emitOn: "peak",
    minPeak,
    fullPeak,
    startRate,
    endRate,
    // Sidesteps the room clock (@couchcade/game-sdk/clock), irrelevant to the speed this test
    // reports.
    toRoomTime: (t) => t,
  });
  const emitted: Swing[] = [];
  detector.on((swing) => emitted.push(swing));
  detector.mark({ type: "grip-down", t: 0 });
  for (const sample of puttBurst(0, durationMs, gamma)) detector.push(tracker.push(sample));
  detector.mark({ type: "grip-up", t: durationMs + 200 });
  return emitted;
}

describe("Putt Club swing tuning (minPeak 120, fullPeak 600, startRate 70, endRate 40)", () => {
  it("a gentle tap-in around 150 deg/s -- under the package's 240 deg/s minPeak -- still fires", () => {
    const emitted = replay(150);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.speed).toBeGreaterThan(0);
    console.log(`[CC-13.3 swing tuning] tap-in (150 deg/s) speed: ${emitted[0]?.speed}`);
  });

  it("a firm putting stroke around 600 deg/s -- Putt Club's own fullPeak -- reaches near speed 1", () => {
    const emitted = replay(600);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.speed).toBeGreaterThanOrEqual(0.9);
    console.log(`[CC-13.3 swing tuning] firm putt (600 deg/s) speed: ${emitted[0]?.speed}`);
  });

  it("a still phone (a wobble, not a swing) never fires", () => {
    expect(replay(0)).toEqual([]);
  });

  it("a small wobble under the softest deliberate putt never fires", () => {
    // 80 deg/s: above the package's own detection floor jitter, below Putt Club's 120 minPeak.
    expect(replay(80)).toEqual([]);
  });

  it("reports the speed curve from the softest deliberate putt to full power", () => {
    const gammas = [130, 200, 300, 400, 500, 600];
    for (const gamma of gammas) {
      const emitted = replay(gamma);
      const speed = emitted[0]?.speed ?? 0;
      console.log(`[CC-13.3 swing tuning] ${gamma} deg/s -> speed ${speed}`);
    }
    // Sanity bound only, so a wiring bug (not a tuning question) shows up as a failing test.
    const speeds = gammas.map((gamma) => replay(gamma)[0]?.speed ?? 0);
    for (let i = 1; i < speeds.length; i++)
      expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1]!);
  });
});
