/**
 * `@couchcade/motion/sensors`: reading phone motion sensors (docs/architecture/motion.md,
 * "Sensor adapter").
 *
 * - `types.ts`: `MotionSample`, `MotionPermission`, `MotionCapability`, `MotionAdapter`
 * - `sample.ts`: turning `devicemotion` events into samples, capability per sample
 * - `browser.ts`: `createBrowserAdapter`, the only code that touches `DeviceMotionEvent`
 * - `capability.ts`: `waitForCapability`, the 1 s real-data check after `granted`
 * - `fake.ts`: `createFakeAdapter` for unit and E2E tests
 * - `trace.ts`: the version 1 trace format and `traceSamples`
 * - `synthetic.ts`: `synthetic.still` and `synthetic.swing` trace builders
 */
export * from "./browser.ts";
export * from "./capability.ts";
export * from "./fake.ts";
export * from "./sample.ts";
export * from "./synthetic.ts";
export * from "./trace.ts";
export type * from "./types.ts";
