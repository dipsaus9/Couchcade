/**
 * `@couchcade/motion/gestures`: detectors that turn samples into gesture events and values
 * (docs/architecture/motion.md, "Gesture contracts").
 *
 * - `aim.ts`: `createAimDetector` with recentring, and `createAimSender`, which streams aim samples
 *   packed through the CC-3.6 input stream (CC-5.5)
 * - `flick.ts`: `createFlickDetector`, one throw event per forward wrist snap while the grip is held (CC-5.6)
 * - `swing.ts`: `createSwingDetector`, one event per swing while the grip is held (CC-5.4)
 */
export * from "./aim.ts";
export * from "./flick.ts";
export * from "./swing.ts";
