/**
 * The fake sensor adapter (motion.md adapter rule 7). Unit tests use it directly. E2E tests reach
 * it through `window.__couchcadeMotion`: Playwright sets `{ permission }` before the page loads
 * (e2e/src/motion.ts), and in dev and test builds `apps/controller/src/motion/adapter.ts` (CC-5.10)
 * creates this fake, calls `setPermission(permission)` and stores it on the global as `adapter`.
 * The test then drives it with `push()` and `play()`.
 */
import { bestCapability, sampleCapability } from "./sample.ts";
import { traceSamples } from "./trace.ts";
import type { Trace } from "./trace.ts";
import type {
  MotionAdapter,
  MotionCapability,
  MotionListener,
  MotionPermission,
  MotionSample,
} from "./types.ts";

export interface FakeMotionAdapter extends MotionAdapter {
  /** What the next `request()` resolves to. */
  setPermission(result: MotionPermission): void;
  /**
   * Pushes the trace's samples on their timestamps and resolves after the last one. `speed` 2
   * plays twice as fast. Each pushed sample's `t` is the local time when playback started plus
   * its `t` in the trace, whatever the speed, so detectors see the recorded timing.
   */
  play(trace: Pick<Trace, "v" | "samples">, options?: { speed?: number }): Promise<void>;
  /** Delivers one sample to every started listener right away. */
  push(sample: MotionSample): void;
}

export interface FakeMotionAdapterOptions {
  /** What `request()` resolves to until `setPermission()` changes it. Defaults to `granted`. */
  permission?: MotionPermission;
  /** Local clock in ms, the base for played samples. Defaults to `performance.now()`. */
  now?: () => number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFakeAdapter({
  permission = "granted",
  now = () => performance.now(),
}: FakeMotionAdapterOptions = {}): FakeMotionAdapter {
  const listeners = new Set<MotionListener>();
  let result = permission;
  let best: MotionCapability = "none";

  const push = (sample: MotionSample) => {
    best = bestCapability(best, sampleCapability(sample));
    for (const listener of listeners) listener(sample);
  };

  return {
    request: () => Promise.resolve(result),

    start(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    capability: () => best,

    setPermission(next) {
      result = next;
    },

    push,

    async play(trace, { speed = 1 } = {}) {
      if (!(speed > 0)) throw new RangeError(`Trace speed must be above 0, got ${speed}.`);
      const samples = traceSamples(trace);
      const first = samples[0]?.t ?? 0;
      const base = now();
      for (const sample of samples) {
        const offset = sample.t - first;
        const wait = offset / speed - (now() - base);
        if (wait > 0) await sleep(wait);
        push({ ...sample, t: base + offset });
      }
    },
  };
}
