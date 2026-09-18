/**
 * Checks the owner's aim speed (6 px per degree, `aimPxPerDegree`) against hold, sweep and release
 * traces, and reports p90 hold wobble, reach and release twitch (CC-11.9, docs/architecture/
 * realtime-link.md, "Tuning Target Range's aim speed").
 *
 * No real trace exists yet under `packages/motion/test/traces/` -- the owner's `pnpm trace:record`
 * pass (CC-5.9) is still to do. These are synthetic stand-ins built the same way
 * `controller/aim.test.ts` builds its motion samples (`turning()`, `flatCalibration()`): a small
 * ~8 Hz wrist tremor for the hold, a slow steady turn for the sweep, and a quick extra flick in the
 * last 50 ms for the release. The numbers below are recorded in the task's notes; per the doc, no
 * value changes without the owner's approval, whatever they come out as.
 */
import { describe, expect, it } from "vitest";
import { createPoseTracker } from "@couchcade/motion/calibration";
import { createAimDetector } from "@couchcade/motion/gestures";
import type { MotionSample } from "@couchcade/motion/sensors";
import { aimPxPerDegree, pitchPx, yawPx } from "../../src/shared/constants.ts";
import { aimPoint } from "../../src/shared/index.ts";
import { flatCalibration } from "./motion.ts";

const yawRangeDeg = yawPx / aimPxPerDegree;
const pitchRangeDeg = pitchPx / aimPxPerDegree;
const intervalMs = 16;
const G = 9.81;

/** One sample at `t`, turning at `gammaDegPerS` deg/s (yaw) around the screen's axis. */
function sampleAt(t: number, gammaDegPerS: number): MotionSample {
  return {
    t,
    interval: intervalMs,
    acceleration: { x: 0, y: 0, z: 0 },
    gravityAcceleration: { x: 0, y: 0, z: G },
    rotationRate: { alpha: 0, beta: 0, gamma: gammaDegPerS },
  };
}

/** Replays `samples` through one pose tracker and one aim detector, tuned like the controller. */
function replay(samples: MotionSample[]): Array<{ t: number; x: number; y: number }> {
  const tracker = createPoseTracker(flatCalibration());
  const detector = createAimDetector({ yawRangeDeg, pitchRangeDeg });
  return samples.map((sample) => {
    detector.push(tracker.push(sample));
    const point = aimPoint(detector.aim());
    return { t: sample.t, ...point };
  });
}

function p90(values: number[]): number {
  const sorted = [...values].toSorted((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

/** A steady hold with a small, roughly 8 Hz hand tremor (a modelled stand-in, see file docstring). */
function holdTrace(durationMs: number, amplitudeDeg: number, hz = 8): MotionSample[] {
  const samples: MotionSample[] = [];
  for (let t = 0; t <= durationMs; t += intervalMs) {
    // angle(t) = amplitude * sin(2*pi*hz*t); rate is its derivative.
    const gamma = amplitudeDeg * 2 * Math.PI * hz * Math.cos((2 * Math.PI * hz * t) / 1000);
    samples.push(sampleAt(t, gamma));
  }
  return samples;
}

/** A slow, steady turn from home at `degPerS` deg/s. */
function sweepTrace(durationMs: number, degPerS: number): MotionSample[] {
  const samples: MotionSample[] = [];
  for (let t = 0; t <= durationMs; t += intervalMs) samples.push(sampleAt(t, degPerS));
  return samples;
}

/** A draw held steady, then a quick extra flick in the last `twitchMs` before release. */
function releaseTrace(steadyMs: number, twitchMs: number, twitchDegPerS: number): MotionSample[] {
  const samples: MotionSample[] = [];
  for (let t = 0; t <= steadyMs; t += intervalMs) samples.push(sampleAt(t, 0));
  for (let t = intervalMs; t <= twitchMs; t += intervalMs) {
    samples.push(sampleAt(steadyMs + t, twitchDegPerS));
  }
  return samples;
}

describe("Target Range aim tuning (owner decision: 6 px per degree)", () => {
  it("reports p90 hold wobble: at most 3 px is the owner's target", () => {
    const points = replay(holdTrace(5000, 0.35));
    const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const distances = points.map((p) => Math.hypot(p.x - meanX, p.y - meanY));
    const wobblePx = p90(distances);
    // Reported, not asserted against 3 px: a synthetic tremor amplitude is a guess, not a
    // measurement. Sanity bound only, so a wiring bug shows up as a failing test.
    expect(wobblePx).toBeLessThan(50);
    console.log(
      `[CC-11.9 aim tuning] p90 hold wobble (synthetic 8 Hz, 0.35° tremor): ${wobblePx.toFixed(2)} px`,
    );
  });

  it("reports the reach to the target zone edge (±80 px): 10° to 20° is the owner's target", () => {
    const points = replay(sweepTrace(6000, 5));
    const edge = points.find((p) => Math.abs(p.x - 240) >= 80);
    expect(edge).toBeDefined();
    const reachDeg = ((edge?.t ?? 0) / 1000) * 5;
    expect(reachDeg).toBeGreaterThan(0);
    console.log(`[CC-11.9 aim tuning] reach to the target zone edge: ${reachDeg.toFixed(2)}°`);
  });

  it("reports the release twitch: aim change in the last 50 ms before release, for rule 2 of The phone decides its own shot", () => {
    const points = replay(releaseTrace(2000, 50, 40));
    const before = points.find((p) => Math.abs(p.t - 2000) < intervalMs / 2);
    const release = points.at(-1);
    expect(before).toBeDefined();
    expect(release).toBeDefined();
    const twitchPx = Math.hypot(
      (release?.x ?? 0) - (before?.x ?? 0),
      (release?.y ?? 0) - (before?.y ?? 0),
    );
    console.log(
      `[CC-11.9 aim tuning] release twitch (last 50 ms, synthetic 40°/s flick): ${twitchPx.toFixed(2)} px`,
    );
  });
});
