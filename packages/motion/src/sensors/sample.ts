/**
 * Turning raw `devicemotion` data into `MotionSample`s and reading capability from them
 * (motion.md adapter rules 3 and 4). Shared by the browser adapter and the fake.
 */
import type { MotionCapability, MotionSample, RotationRate, Vec3 } from "./types.ts";

/** A reading as the browser may deliver it: any field may be missing, `null` or `NaN`. */
type RawNumber = number | null | undefined;

/** The parts of a `DeviceMotionEvent` the adapter reads. Plain objects work in tests. */
export interface DeviceMotionEventLike {
  timeStamp: number;
  interval?: RawNumber;
  acceleration?: { x: RawNumber; y: RawNumber; z: RawNumber } | null;
  accelerationIncludingGravity?: { x: RawNumber; y: RawNumber; z: RawNumber } | null;
  rotationRate?: { alpha: RawNumber; beta: RawNumber; gamma: RawNumber } | null;
}

const isNumber = (value: RawNumber): value is number =>
  typeof value === "number" && !Number.isNaN(value);

function toVec3(raw: DeviceMotionEventLike["acceleration"]): Vec3 | null {
  if (!raw || !isNumber(raw.x) || !isNumber(raw.y) || !isNumber(raw.z)) return null;
  return { x: raw.x, y: raw.y, z: raw.z };
}

function toRotationRate(raw: DeviceMotionEventLike["rotationRate"]): RotationRate | null {
  if (!raw || !isNumber(raw.alpha) || !isNumber(raw.beta) || !isNumber(raw.gamma)) return null;
  return { alpha: raw.alpha, beta: raw.beta, gamma: raw.gamma };
}

/**
 * Values pass through as delivered. A vector with a missing or `NaN` component becomes `null`, and
 * a missing interval becomes `0`. Signs are never changed here: calibration (CC-5.3) does that.
 */
export function toMotionSample(event: DeviceMotionEventLike): MotionSample {
  return {
    t: event.timeStamp,
    interval: isNumber(event.interval) ? event.interval : 0,
    acceleration: toVec3(event.acceleration),
    gravityAcceleration: toVec3(event.accelerationIncludingGravity),
    rotationRate: toRotationRate(event.rotationRate),
  };
}

/** `full` with a rotation rate, `accelerometer` with only acceleration, `none` otherwise. */
export function sampleCapability(sample: MotionSample): MotionCapability {
  if (sample.rotationRate) return "full";
  if (sample.acceleration || sample.gravityAcceleration) return "accelerometer";
  return "none";
}

const rank: Record<MotionCapability, number> = { none: 0, accelerometer: 1, full: 2 };

/** The better of two capabilities. A sample with less data never downgrades a phone. */
export function bestCapability(a: MotionCapability, b: MotionCapability): MotionCapability {
  return rank[b] > rank[a] ? b : a;
}
