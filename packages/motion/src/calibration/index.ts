/**
 * `@couchcade/motion/calibration`: turning device-frame samples into motion-frame values every
 * detector shares (docs/architecture/motion.md, "Calibration and the motion frame").
 *
 * - `rest.ts`: `createRestCalibration`, the one second of holding still that finds up, the
 *   gyroscope bias and the gravity sign
 * - `signs.ts`: `detectSigns` and `applySigns`, measured instead of assumed per platform
 * - `frame.ts`: `motionFrame` (right, forward, up), `correctSample`, `normaliseSample`
 * - `pose.ts`: `createPoseTracker`, the orientation that follows the phone after calibration
 * - `vector.ts`: the small vector and quaternion maths behind them (only `Quaternion` and `rotate`,
 *   `multiply`, `conjugate` are public; detectors in this package import the rest directly)
 * - `types.ts`: `Calibration`, `MotionFrame`
 */
export * from "./frame.ts";
export * from "./pose.ts";
export * from "./rest.ts";
export * from "./signs.ts";
export type * from "./types.ts";
export { conjugate, multiply, rotate, type Quaternion } from "./vector.ts";
