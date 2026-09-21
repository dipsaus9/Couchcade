/**
 * The joystick fallback for tilt (docs/architecture/motion.md, "Tilt (CC-5.7)", "Touch fallback:
 * joystick"). Phones without a gyroscope, and players who chose touch, steer with it. It emits
 * exactly what the motion detector emits, so a game can't tell them apart, and its readings go
 * through the same `createTiltSender`.
 *
 * `CcJoystick` (`@couchcade/ui`, CC-4.5) already emits a normalised nipplejs vector -- right
 * positive `x`, up the screen positive `y`, both −1 to 1 -- so this adapter only applies tilt's
 * shared dead zone, rescaling and rounding (AC#3: the same shape the motion detector produces).
 * `@couchcade/motion` is kit, same tier as `@couchcade/ui`, so it never imports it directly
 * (.dependency-cruiser.cjs, "kit packages never import each other"); the controller wiring passes
 * the joystick's `move` vector in.
 *
 * ```ts
 * const tilt = createTiltJoystick();
 * tilt.on((reading) => sender.update(reading));
 * joystick.onMove = (vector) => tilt.push({ t: performance.now(), ...vector });
 * ```
 */
import { createTiltOutput, type TiltOutputOptions, type TiltSource } from "../gestures/tilt.ts";

/** One joystick vector reading, shaped like `CcJoystick`'s `move` event, with a local time. */
export interface JoystickVector {
  t: number;
  /** Right positive, −1 to 1. */
  x: number;
  /** Up the screen positive, −1 to 1. */
  y: number;
}

export type TiltJoystick = TiltSource<JoystickVector>;

/**
 * The joystick pad (motion.md, "Touch fallback: joystick"): applies the same radial dead zone,
 * rescaling and rounding as the motion detector to the raw drag vector, so releasing the stick
 * (which `CcJoystick` reports as `{ x: 0, y: 0 }`) settles back at rest.
 */
export function createTiltJoystick(options: TiltOutputOptions = {}): TiltJoystick {
  const output = createTiltOutput(options);
  return {
    push(vector) {
      output.set(vector.t, vector.x, vector.y);
    },
    reset() {
      output.reset();
    },
    tilt: output.tilt,
    on: output.on,
  };
}
