/**
 * Test helpers for the controller: a calibrated phone lying flat with its top edge pointing at the
 * TV, so turning around the screen's axis (`gamma`) is pure yaw, and a fast enough turn is a swing.
 */
import { calibrateRest, type Calibration } from "@couchcade/motion/calibration";
import { synthetic, traceSamples, type MotionSample } from "@couchcade/motion/sensors";

const G = 9.81;

export function flatCalibration(): Calibration {
  const trace = synthetic.still({ durationMs: 1500, gravity: [0, 0, G] });
  const calibration = calibrateRest(traceSamples(trace));
  if (calibration === null) throw new Error("calibration did not complete");
  return calibration;
}

/** One sample at `t` turning at `gamma` deg/s around the screen's axis, with no linear push. */
export function turning(t: number, gamma: number): MotionSample {
  return {
    t,
    interval: 16,
    acceleration: { x: 0, y: 0, z: 0 },
    gravityAcceleration: { x: 0, y: 0, z: G },
    rotationRate: { alpha: 0, beta: 0, gamma },
  };
}

/** Samples every 16 ms from `from` for `durationMs`, turning at `gamma` deg/s. */
export function turn(from: number, durationMs: number, gamma: number): MotionSample[] {
  const samples: MotionSample[] = [];
  for (let t = from; t <= from + durationMs; t += 16) samples.push(turning(t, gamma));
  return samples;
}
