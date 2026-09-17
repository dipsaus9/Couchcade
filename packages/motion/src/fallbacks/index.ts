/**
 * `@couchcade/motion/fallbacks`: touch controls that emit exactly what the gesture detectors emit
 * (docs/architecture/motion.md, "Gesture contracts").
 *
 * - `aim.ts`: `createAimDrag`, the touchpad-style drag pad for aim (CC-5.5)
 * - `swing.ts`: `createSwingSwipe` and `createSwingTap`, the swipe and tap pads for swing (CC-5.4)
 */
export * from "./aim.ts";
export * from "./swing.ts";
