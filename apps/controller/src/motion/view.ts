import type { JsonValue } from "@couchcade/protocol";

/**
 * The `motion-permission` view from the host (docs/architecture/motion.md, "Permission,
 * calibration and resume flow"). apps/host/src/motion/motion-check.ts builds it.
 */
export interface MotionPermissionView {
  /** The game that starts after the step. Its controller shows up with this `gameId`. */
  gameId: string;
  title: string;
  /** Counts motion steps this night. A new number starts the step over, as for "Play again". */
  step: number;
}

/** The motion permission view in `data`, or null when it isn't one. */
export function parseMotionPermissionView(data: JsonValue): MotionPermissionView | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { gameId, title, step } = data;
  if (typeof gameId !== "string" || gameId.length === 0) return null;
  if (typeof title !== "string" || typeof step !== "number" || !Number.isInteger(step)) return null;
  return { gameId, title, step };
}
