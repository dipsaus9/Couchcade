/**
 * `@couchcade/motion`: phones as motion controllers (docs/architecture/motion.md).
 *
 * - `@couchcade/motion/sensors`: the sensor adapter, the fake adapter for tests, traces
 *
 * Calibration, gestures and fallbacks arrive as their own subpaths (CC-5.3 to CC-5.8).
 */
export * from "./sensors/index.ts";
