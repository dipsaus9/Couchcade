import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserAdapter,
  createFakeAdapter,
  MOTION_FIRST_DATA_TIMEOUT_MS,
  waitForCapability,
} from "@couchcade/motion/sensors";
import type { MotionSample } from "@couchcade/motion/sensors";
import { createFakePage, gyroEvent } from "./fake-page.ts";

const empty: MotionSample = {
  t: 1,
  interval: 16,
  acceleration: null,
  gravityAcceleration: null,
  rotationRate: null,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForCapability", () => {
  it("waits one second for real data", () => {
    expect(MOTION_FIRST_DATA_TIMEOUT_MS).toBe(1000);
  });

  it("resolves full at the first sample with a rotation rate", async () => {
    const fake = createFakeAdapter();
    const result = waitForCapability(fake);
    await vi.advanceTimersByTimeAsync(300);
    fake.push({ ...empty, rotationRate: { alpha: 0, beta: 0, gamma: 0 } });
    await expect(result).resolves.toBe("full");
  });

  it("resolves accelerometer for a phone without a gyroscope", async () => {
    const fake = createFakeAdapter();
    const result = waitForCapability(fake);
    fake.push({ ...empty, gravityAcceleration: { x: 0, y: 9.8, z: 0 } });
    await expect(result).resolves.toBe("accelerometer");
  });

  it("ignores events whose fields are all null and resolves none after the timeout", async () => {
    const fake = createFakeAdapter();
    const result = waitForCapability(fake);
    fake.push(empty);
    await vi.advanceTimersByTimeAsync(999);
    fake.push(empty);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("none");
  });

  it("takes a custom timeout", async () => {
    const result = waitForCapability(createFakeAdapter(), { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toBe("none");
  });

  it("stops its own listener either way", async () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);

    const found = waitForCapability(adapter);
    expect(page.motionListenerCount()).toBe(1);
    page.fire(gyroEvent(1));
    await expect(found).resolves.toBe("full");
    expect(page.motionListenerCount()).toBe(0);

    const missing = waitForCapability(adapter);
    await vi.advanceTimersByTimeAsync(MOTION_FIRST_DATA_TIMEOUT_MS);
    await expect(missing).resolves.toBe("none");
    expect(page.motionListenerCount()).toBe(0);
  });
});
