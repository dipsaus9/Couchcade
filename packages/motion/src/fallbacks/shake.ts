/**
 * The button fallback for shake (docs/architecture/motion.md, "Shake (CC-5.8)", "Touch fallback:
 * button"). Phones without an accelerometer, and players who chose touch, dash with it. A dash is
 * a dash -- strength isn't part of it, so this is never weaker or stronger than a real shake. It
 * emits exactly the `Shake` the motion detector emits, so a game can't tell them apart.
 *
 * ```ts
 * const dash = createShakeButton();
 * dash.on((event, t) => stream.fire({ type: "dash", payload: event }, t));
 * button.onpointerdown = (e) => dash.push({ t: e.timeStamp, x: 0, y: 0, type: "down" });
 * ```
 */
import {
  createShakeOutput,
  SHAKE_COOLDOWN_MS,
  type ShakeOutputOptions,
  type ShakeSource,
} from "../gestures/shake.ts";
import type { PointerPoint } from "./aim.ts";

export interface ShakeButtonOptions extends ShakeOutputOptions {
  /** A press less than this after the last one is ignored. Defaults to `SHAKE_COOLDOWN_MS`. */
  cooldownMs?: number;
}

export type ShakeButton = ShakeSource<PointerPoint>;

/**
 * The dash button (motion.md, "Touch fallback: button"): a `down` on the button emits `{ at }`
 * with the `pointerdown` time, at once. Moves, lifts and presses within the 700 ms cooldown do
 * nothing.
 */
export function createShakeButton(options: ShakeButtonOptions = {}): ShakeButton {
  const { cooldownMs = SHAKE_COOLDOWN_MS } = options;
  const output = createShakeOutput(options);
  let lastT = Number.NEGATIVE_INFINITY;

  return {
    push(point) {
      if (point.type !== "down" || point.t - lastT < cooldownMs) return;
      lastT = point.t;
      output.emit(point.t);
    },
    reset() {
      lastT = Number.NEGATIVE_INFINITY;
    },
    on: output.on,
  };
}
