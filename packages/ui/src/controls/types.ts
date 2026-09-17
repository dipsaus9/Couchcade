/**
 * A normalised 2D input vector, -1 to 1 on each axis. `x` positive is to the player's right,
 * `y` positive is up the screen (towards the TV, away from the player). This matches
 * `@couchcade/motion`'s motion frame (docs/architecture/motion.md), so a game's tilt or aim
 * fallback can forward this vector unchanged.
 */
export interface InputVector {
  x: number;
  y: number;
}

/** The four directions a d-pad reports. */
export type DpadDirection = "up" | "down" | "left" | "right";

/** A slider's axis: which way `modelValue` 0 (start) to 1 (end) runs. */
export type SliderOrientation = "horizontal" | "vertical";
