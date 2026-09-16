import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAdapter, synthetic } from "@couchcade/motion/sensors";
import type {
  MotionAdapter,
  MotionPermission,
  MotionSample,
  Trace,
} from "@couchcade/motion/sensors";

const sample = (t: number, overrides: Partial<MotionSample> = {}): MotionSample => ({
  t,
  interval: 16,
  acceleration: { x: 0, y: 0, z: 0 },
  gravityAcceleration: { x: 0, y: 6.9, z: 6.9 },
  rotationRate: { alpha: 1, beta: 2, gamma: 3 },
  ...overrides,
});

/** Shape of the trace rows below: a sample every 20 ms with a rising alpha. */
const trace: Pick<Trace, "v" | "samples"> = {
  v: 1,
  samples: [
    [0, 20, [0, 0, 0], [0, 6.9, 6.9], [0, 0, 0]],
    [20, 20, [0, 0, 0], [0, 6.9, 6.9], [100, 0, 0]],
    [40, 20, null, [0, 6.9, 6.9], [200, 0, 0]],
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createFakeAdapter", () => {
  it("replaces the browser adapter wherever a MotionAdapter is expected", () => {
    const adapter: MotionAdapter = createFakeAdapter();
    expect(adapter.capability()).toBe("none");
  });

  it("resolves request() with granted by default, and with whatever setPermission set", async () => {
    const fake = createFakeAdapter();
    await expect(fake.request()).resolves.toBe("granted");

    for (const permission of ["denied", "unsupported", "granted"] as const) {
      fake.setPermission(permission);
      await expect(fake.request()).resolves.toBe(permission);
    }
    await expect(createFakeAdapter({ permission: "denied" }).request()).resolves.toBe("denied");
  });

  it("pushes samples to every started listener until it stops", () => {
    const fake = createFakeAdapter();
    const a = vi.fn<(sample: MotionSample) => void>();
    const b = vi.fn<(sample: MotionSample) => void>();
    const stopA = fake.start(a);
    fake.start(b);

    fake.push(sample(1));
    stopA();
    fake.push(sample(2));

    expect(a.mock.calls).toEqual([[sample(1)]]);
    expect(b.mock.calls).toEqual([[sample(1)], [sample(2)]]);
  });

  it("reports capability from the pushed samples", () => {
    const fake = createFakeAdapter();
    fake.push(sample(1, { rotationRate: null }));
    expect(fake.capability()).toBe("accelerometer");
    fake.push(sample(2));
    expect(fake.capability()).toBe("full");
  });

  it("plays a trace on its timestamps, based on the local clock, with interval kept", async () => {
    const fake = createFakeAdapter({ now: () => 1000 + performance.now() });
    const got: MotionSample[] = [];
    fake.start((s) => got.push(s));
    const base = 1000 + performance.now();

    const done = fake.play(trace);
    expect(got.map((s) => s.t)).toEqual([base]);

    await vi.advanceTimersByTimeAsync(20);
    expect(got.map((s) => s.t)).toEqual([base, base + 20]);

    await vi.advanceTimersByTimeAsync(20);
    await done;
    expect(got).toEqual([
      sample(base, { rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 20 }),
      sample(base + 20, { rotationRate: { alpha: 100, beta: 0, gamma: 0 }, interval: 20 }),
      sample(base + 40, {
        acceleration: null,
        rotationRate: { alpha: 200, beta: 0, gamma: 0 },
        interval: 20,
      }),
    ]);
  });

  it("plays faster with speed and keeps the recorded timing in t", async () => {
    const fake = createFakeAdapter();
    const got: number[] = [];
    fake.start((s) => got.push(s.t));
    const base = performance.now();

    const done = fake.play(trace, { speed: 2 });
    await vi.advanceTimersByTimeAsync(20);
    await done;

    expect(got).toEqual([base, base + 20, base + 40]);
  });

  it("plays synthetic traces", async () => {
    const fake = createFakeAdapter();
    const peaks: number[] = [];
    fake.start((s) => peaks.push(s.rotationRate?.alpha ?? 0));

    const done = fake.play(synthetic.swing({ peak: 500 }));
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(Math.max(...peaks)).toBeCloseTo(500, 0);
    expect(fake.capability()).toBe("full");
  });

  it("rejects other trace versions and a speed that isn't above 0", async () => {
    const fake = createFakeAdapter();
    await expect(fake.play({ v: 2 as 1, samples: [] })).rejects.toThrow(/version 2/);
    await expect(fake.play(trace, { speed: 0 })).rejects.toThrow(RangeError);
  });

  it("fits the E2E hook the controller fills in on window.__couchcadeMotion", async () => {
    // e2e/src/motion.ts sets { permission } before load. apps/controller/src/motion/adapter.ts
    // (CC-5.10) creates the fake, applies the permission and stores it as `adapter`.
    interface MotionHook {
      permission: MotionPermission;
      adapter?: {
        setPermission(result: MotionPermission): void;
        push(sample: MotionSample): void;
        play(
          trace: { v: 1; samples: unknown[] } & Record<string, unknown>,
          options?: { speed?: number },
        ): Promise<void>;
      };
    }
    const hook: MotionHook = { permission: "denied" };
    const fake = createFakeAdapter();
    fake.setPermission(hook.permission);
    // No cast: the fake has to be assignable to the shape e2e/src/motion.ts drives.
    hook.adapter = fake;

    await expect(fake.request()).resolves.toBe("denied");
    const listener = vi.fn<(sample: MotionSample) => void>();
    fake.start(listener);
    hook.adapter?.push(sample(7));
    expect(listener).toHaveBeenCalledWith(sample(7));
  });
});
