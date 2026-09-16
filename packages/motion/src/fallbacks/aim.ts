/**
 * The drag fallback for aim (docs/architecture/motion.md, "Aim (CC-5.5)", "Touch fallback: drag").
 * Phones without a gyroscope, and players who chose touch, aim with it. It emits exactly what the
 * motion detector emits, so a game can't tell them apart, and its readings go through the same
 * `createAimSender`.
 *
 * ```ts
 * const aim = createAimDrag();
 * aim.on((reading) => sender.update(reading));
 * pad.onpointermove = (e) => aim.push({ t: e.timeStamp, x: e.clientX, y: e.clientY, type: "move" });
 * centreButton.onclick = (e) => aim.recentre(e.timeStamp);
 * ```
 */
import { type AimSource, createAimOutput } from "../gestures/aim.ts";

/** A pointer event reduced to what fallbacks read: time in ms and position in CSS pixels. */
export interface PointerPoint {
  t: number;
  x: number;
  y: number;
  type: "down" | "move" | "up" | "cancel";
}

export interface AimDragOptions {
  /** CSS px of horizontal drag that moves yaw across its whole range, from −1 to 1. Defaults to 200. */
  yawDragPx?: number;
  /** CSS px of vertical drag that moves pitch across its whole range, from −1 to 1. Defaults to 150. */
  pitchDragPx?: number;
}

export type AimDrag = AimSource<PointerPoint>;

/**
 * A touchpad-style aim pad:
 *
 * - Dragging moves the aim relative to where it was. Right is positive yaw and up the screen is
 *   positive pitch. 200 px of drag crosses the whole yaw range and 150 px the whole pitch range,
 *   clamped to ±1, so dragging back from an edge moves the aim at once.
 * - Moves only count between `down` and `up` or `cancel`.
 * - `recentre()` (the "Centre" button, or the game's recentre moment) sets both back to 0.
 */
export function createAimDrag(options: AimDragOptions = {}): AimDrag {
  const { yawDragPx = 200, pitchDragPx = 150 } = options;
  const output = createAimOutput();

  let yaw = 0;
  let pitch = 0;
  let last: PointerPoint | null = null;
  let lastT: number | null = null;

  return {
    push(point) {
      lastT = point.t;
      if (point.type === "down") {
        last = point;
        return;
      }
      if (last === null) return;
      yaw = clampUnit(yaw + ((point.x - last.x) * 2) / yawDragPx);
      pitch = clampUnit(pitch - ((point.y - last.y) * 2) / pitchDragPx);
      last = point.type === "move" ? point : null;
      output.set(point.t, yaw, pitch);
    },
    recentre(t) {
      yaw = 0;
      pitch = 0;
      output.set(t ?? lastT ?? 0, 0, 0);
    },
    reset() {
      yaw = 0;
      pitch = 0;
      last = null;
      lastT = null;
      output.reset();
    },
    aim: output.aim,
    on: output.on,
  };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
