/**
 * The real-data check after `granted` (motion.md adapter rule 2): some browsers grant access and
 * then send nothing, or send events with every field `null`.
 */
import { bestCapability, sampleCapability } from "./sample.ts";
import type { MotionAdapter, MotionCapability } from "./types.ts";

/** How long to wait for the first sample with data before treating the phone as unsupported. */
export const MOTION_FIRST_DATA_TIMEOUT_MS = 1000;

/**
 * Listens until a sample carries data and resolves with the phone's capability, or with `none`
 * after `timeoutMs`. An event whose fields are all `null` doesn't count. Stops its own listener
 * either way. Call it after `request()` resolved `granted`.
 */
export function waitForCapability(
  adapter: MotionAdapter,
  { timeoutMs = MOTION_FIRST_DATA_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<MotionCapability> {
  return new Promise((resolve) => {
    let done = false;
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => finish("none"), timeoutMs);
    const finish = (capability: MotionCapability) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop?.();
      resolve(capability);
    };
    stop = adapter.start((sample) => {
      const capability = sampleCapability(sample);
      if (capability !== "none") finish(bestCapability(adapter.capability(), capability));
    });
    if (done) stop();
  });
}
