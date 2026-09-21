/**
 * `@couchcade/motion/fallbacks`: touch controls that emit exactly what the gesture detectors emit
 * (docs/architecture/motion.md, "Gesture contracts").
 *
 * - `aim.ts`: `createAimDrag`, the touchpad-style drag pad for aim (CC-5.5)
 * - `flick.ts`: `createFlickSwipe`, the swipe pad for flick (CC-5.6)
 * - `swing.ts`: `createSwingSwipe` and `createSwingTap`, the swipe and tap pads for swing (CC-5.4)
 * - `tilt.ts`: `createTiltJoystick`, the joystick pad for tilt (CC-5.7)
 */
export * from "./aim.ts";
export * from "./flick.ts";
export * from "./swing.ts";
export * from "./tilt.ts";
