import { describe, expect, it } from "vitest";
import {
  createSwingDetector,
  SWING_FULL_PEAK,
  SWING_MIN_PEAK,
  type Swing,
} from "@couchcade/motion/gestures";
import { PEAK_MS, replay, swingTrace, type SwingTraceSpec } from "./traces.ts";

/**
 * CC-12.8: a real full-arm bowling swing against something more realistic than the small, fast
 * traces the rest of this suite tunes edge cases with (`detector.test.ts` mostly uses the 120°
 * default arc from `traces.ts`, closer to a forearm/wrist flick than a bowler's full arm). No
 * recorded real-device trace exists in this repo yet (`packages/motion/test/traces/swing/` is
 * empty, and `pnpm trace:record` needs a real phone this environment doesn't have) - so this
 * builds a documented, physically-reasoned "real swing" fixture on the same pendulum-arm model
 * `traces.ts` already uses for every other swing test, per the story's own allowance for that when
 * no capture exists.
 *
 * Reasoning for the numbers below:
 *
 * - **Arc.** `docs/architecture/motion.md` ("How Wii-style games map to our gestures") models
 *   Strike Night on Wii Sports bowling: hold the grip, swing back and forward from the shoulder,
 *   let go. That is a full-arm swing, not a forearm flick - realistically sweeping from behind the
 *   hip at the top of the backswing, through the bottom, to a forward follow-through: roughly
 *   150-165° end to end, well past `traces.ts`'s 120° default (tuned for a much smaller, faster
 *   motion). `armArcDeg` below models that directly.
 * - **Peak rate.** Angular velocity is arc/time at the shoulder, independent of arm length; only
 *   the resulting *linear* hand speed depends on `armM`. A controlled, deliberate bowling-style
 *   release (not a max-effort throw - the owner decision on `SWING_FULL_PEAK` is 900 deg/s "a
 *   firm, controlled swing", and harder adds nothing) plausibly moves the hand at something like
 *   3-5 m/s. With a 0.6 m arm (`armM`'s existing default - shoulder to a phone held at chest/arm's
 *   length) that is peak = v / armM in rad/s, converted to deg/s: (3 to 5) / 0.6 * (180/π) ≈
 *   286-478 deg/s. The fixtures below span that: a firm-but-controlled swing at 450 deg/s, and a
 *   slower, more cautious swing (plausible for a first attempt with someone else's phone and no
 *   wrist strap - motion.md, "Safety") near the low end at 260 deg/s, just above `SWING_MIN_PEAK`
 *   (240).
 * - **Release delay.** A full swing's own deceleration after the peak scales with arc/peak (see
 *   `SWING_RELEASE_WINDOW_MS`'s comment in `swing.ts`): half the swing's duration is spent
 *   decelerating after the peak, before the arm "feels done" - `(π × armArcDeg × 1000) / (4 ×
 *   peak)`. For arc=155°/peak=450 that tail is ≈270 ms; for arc=165°/peak=260 it stretches to
 *   ≈500 ms. On top of that a player has to consciously let go of the on-screen grip - unlike a
 *   Wii Remote button physically released mid-throw, this needs a deliberate ~150-280 ms reaction.
 *   `gripUpMs` below reflects both: a generous but still bounded delay after the peak, never left
 *   at an unrealistic "instant" release.
 */

const localTime = (t: number) => t;

const firmRealisticSwing: SwingTraceSpec = {
  peak: 450,
  armArcDeg: 155,
  // ~270 ms mechanical deceleration tail + ~280 ms reaction to let go.
  gripUpMs: PEAK_MS + 550,
};

const cautiousRealisticSwing: SwingTraceSpec = {
  peak: 260,
  armArcDeg: 165,
  // ~500 ms mechanical deceleration tail + ~150 ms reaction to let go, still inside the window.
  gripUpMs: PEAK_MS + 650,
};

describe("createSwingDetector against a realistic full-arm bowling swing (CC-12.8)", () => {
  it.each([
    ["a firm, controlled real swing", firmRealisticSwing],
    ["a slower, cautious real swing", cautiousRealisticSwing],
  ])("registers %s as a throw in Strike Night's own release mode, without a swipe", (_, spec) => {
    const detector = createSwingDetector({ emitOn: "release", toRoomTime: localTime });
    const emitted = replay(swingTrace(spec), detector);
    expect(emitted).toHaveLength(1);
    const swing = emitted[0]?.swing as Swing;
    // Both peaks sit between the floor and the ceiling, so the swing should count for something
    // but never max out (this isn't the 900 deg/s "swinging harder adds nothing" ceiling).
    expect(swing.speed).toBeGreaterThan(0);
    expect(swing.speed).toBeLessThan(1);
    expect(Math.abs(swing.angle)).toBeLessThanOrEqual(5); // a straight bowl, not an accidental curve
    expect(SWING_MIN_PEAK).toBeLessThan(SWING_FULL_PEAK); // sanity: the scale itself hasn't moved
  });

  it("still emits nothing for a real swing that never reaches a firm effort", () => {
    // A very gentle, barely-there motion (well under SWING_MIN_PEAK) must keep emitting nothing -
    // tuning the release window for real swings must not turn the detector into a hair trigger.
    const detector = createSwingDetector({ emitOn: "release", toRoomTime: localTime });
    const gentle: SwingTraceSpec = { peak: 150, armArcDeg: 165, gripUpMs: PEAK_MS + 650 };
    expect(replay(swingTrace(gentle), detector)).toEqual([]);
  });

  it("a wide, firm swing's natural spin still reads as a real hook, not noise", () => {
    // A firm full-arm swing with a natural wrist twist at release (spin) should still come through
    // sanely once the arc and timing are realistic, not just in the small-arc default trace.
    const detector = createSwingDetector({ emitOn: "release", toRoomTime: localTime });
    const spec: SwingTraceSpec = { ...firmRealisticSwing, twist: 300 };
    const emitted = replay(swingTrace(spec), detector);
    expect(emitted).toHaveLength(1);
    const swing = emitted[0]?.swing as Swing;
    expect(swing.spin).toBeGreaterThan(0);
  });
});
