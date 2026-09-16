/**
 * The sensor adapter contract from docs/architecture/motion.md, "Sensor adapter". Everything after
 * the adapter (calibration, gestures, the controller) sees only these types, never
 * `DeviceMotionEvent`.
 */

/** A vector in the device frame: x to the right of the screen, y to its top, z out of it. */
export type Vec3 = { x: number; y: number; z: number };

/** Rotation rate in degrees per second around x (`alpha`), y (`beta`) and z (`gamma`). */
export type RotationRate = { alpha: number; beta: number; gamma: number };

/** One `devicemotion` event, with values as the browser delivered them and `NaN` as `null`. */
export type MotionSample = {
  /** `event.timeStamp` in ms, the same time base as touch events. */
  t: number;
  /** `event.interval` in ms, for diagnostics only. `0` when the browser didn't give one. */
  interval: number;
  /** m/s², device frame, gravity removed by the platform. */
  acceleration: Vec3 | null;
  /** `accelerationIncludingGravity` in m/s², device frame, sign as delivered (see CC-5.3). */
  gravityAcceleration: Vec3 | null;
  /** deg/s around x, y and z (current W3C spec and all browsers). */
  rotationRate: RotationRate | null;
};

/** What `request()` reports. */
export type MotionPermission = "granted" | "denied" | "unsupported";

/**
 * What the phone's sensors deliver. `full` has a gyroscope (swing, aim and flick work).
 * `accelerometer` has only acceleration (tilt and shake work; swing, aim and flick use touch).
 * `none` has no sensor data at all.
 */
export type MotionCapability = "full" | "accelerometer" | "none";

/** Receives every sample, unthrottled (motion.md adapter rule 8). */
export type MotionListener = (sample: MotionSample) => void;

export interface MotionAdapter {
  /**
   * Asks for sensor access. Call it from a tap handler, before any `await`: the browser only shows
   * the prompt inside a user gesture.
   */
  request(): Promise<MotionPermission>;
  /** Starts delivering samples to `listener`. Returns `stop()`. */
  start(listener: MotionListener): () => void;
  /** The best capability seen in the samples so far. `none` until data arrives. */
  capability(): MotionCapability;
}
