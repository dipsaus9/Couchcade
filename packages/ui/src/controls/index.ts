/**
 * `@couchcade/ui/controls`: raw touch and pointer input primitives games wire into a controller.
 *
 * These emit local events only (a normalised vector, a press/release, a tap count, a 0-1
 * position). Turning them into a game's gestures, batching input to the phone budget and sending
 * it through the room clock is `@couchcade/motion` and a game's `src/controller/` (platform.md).
 */
export { default as CcDpad } from "./CcDpad.vue";
export { default as CcDragSlider } from "./CcDragSlider.vue";
export { default as CcHoldButton } from "./CcHoldButton.vue";
export { default as CcJoystick } from "./CcJoystick.vue";
export { default as CcMashButton } from "./CcMashButton.vue";
export type { DpadDirection, InputVector, SliderOrientation } from "./types.ts";
