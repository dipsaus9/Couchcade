/**
 * `@couchcade/motion/gestures`: detectors that turn samples into gesture events and values
 * (docs/architecture/motion.md, "Gesture contracts").
 *
 * - `aim.ts`: `createAimDetector` with recentring, and `createAimSender`, which streams aim samples
 *   packed through the CC-3.6 input stream (CC-5.5)
 */
export * from "./aim.ts";
