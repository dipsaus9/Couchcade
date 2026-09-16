import { describe, expect, it, vi } from "vitest";
import { createBrowserAdapter } from "@couchcade/motion/sensors";
import type { MotionSample } from "@couchcade/motion/sensors";
import { createFakePage, gyroEvent } from "./fake-page.ts";

describe("request()", () => {
  it("calls requestPermission synchronously, so it stays inside the tap, and reports granted", async () => {
    const requestPermission = vi.fn<() => Promise<string>>(() => Promise.resolve("granted"));
    const page = createFakePage({ motionEvent: { requestPermission } });
    const adapter = createBrowserAdapter(page.env);

    const answer = adapter.request();
    // Called before request() returned: no await ran in between.
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await expect(answer).resolves.toBe("granted");
  });

  it("reports denied when the player refuses", async () => {
    const page = createFakePage({
      motionEvent: { requestPermission: () => Promise.resolve("denied") },
    });
    await expect(createBrowserAdapter(page.env).request()).resolves.toBe("denied");
  });

  it("reports denied for any answer other than granted", async () => {
    const page = createFakePage({
      motionEvent: { requestPermission: () => Promise.resolve("prompt") },
    });
    await expect(createBrowserAdapter(page.env).request()).resolves.toBe("denied");
  });

  it("reports unsupported when requestPermission rejects, as it does without a user gesture", async () => {
    const error = new Error("The request is not allowed");
    error.name = "NotAllowedError";
    const page = createFakePage({
      motionEvent: { requestPermission: () => Promise.reject(error) },
    });
    await expect(createBrowserAdapter(page.env).request()).resolves.toBe("unsupported");
  });

  it("reports unsupported when requestPermission throws", async () => {
    const page = createFakePage({
      motionEvent: {
        requestPermission: () => {
          throw new TypeError("Illegal invocation");
        },
      },
    });
    await expect(createBrowserAdapter(page.env).request()).resolves.toBe("unsupported");
  });

  it("reports granted without a prompt where requestPermission doesn't exist", async () => {
    const page = createFakePage({ motionEvent: {} });
    await expect(createBrowserAdapter(page.env).request()).resolves.toBe("granted");
  });

  it("reports unsupported when the browser has no DeviceMotionEvent", async () => {
    const page = createFakePage({ motionEvent: undefined });
    await expect(createBrowserAdapter(page.env).request()).resolves.toBe("unsupported");
  });

  it("reports unsupported on an insecure page without asking", async () => {
    const requestPermission = vi.fn<() => Promise<string>>(() => Promise.resolve("granted"));
    const page = createFakePage({ motionEvent: { requestPermission }, secure: false });
    await expect(createBrowserAdapter(page.env).request()).resolves.toBe("unsupported");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("never calls requestPermission outside a user gesture", async () => {
    const requestPermission = vi.fn<() => Promise<string>>(() => Promise.resolve("granted"));
    const activation = { isActive: false };
    const page = createFakePage({ motionEvent: { requestPermission }, userActivation: activation });
    const adapter = createBrowserAdapter(page.env);

    await expect(adapter.request()).resolves.toBe("unsupported");
    expect(requestPermission).not.toHaveBeenCalled();

    activation.isActive = true; // a tap
    await expect(adapter.request()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("is the only thing that calls requestPermission: creating, starting and visibility changes don't", () => {
    const requestPermission = vi.fn<() => Promise<string>>(() => Promise.resolve("granted"));
    const page = createFakePage({ motionEvent: { requestPermission } });
    const adapter = createBrowserAdapter(page.env);

    const stop = adapter.start(() => {});
    page.fire(gyroEvent(1));
    page.hide();
    page.show();
    stop();

    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe("samples", () => {
  it("passes values as delivered and exposes event.interval for diagnostics", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    const samples: MotionSample[] = [];
    adapter.start((sample) => samples.push(sample));

    page.fire(gyroEvent(1234.5, { interval: 16.7 }));

    expect(samples).toEqual([
      {
        t: 1234.5,
        interval: 16.7,
        acceleration: { x: 0.1, y: -0.2, z: 0.3 },
        gravityAcceleration: { x: 0.1, y: 6.9, z: -6.9 },
        rotationRate: { alpha: 12, beta: -4, gamma: 1.5 },
      },
    ]);
  });

  it("turns NaN and missing values into null, and a missing interval into 0", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    const samples: MotionSample[] = [];
    adapter.start((sample) => samples.push(sample));

    page.fire({
      timeStamp: 5,
      interval: null,
      acceleration: { x: Number.NaN, y: 0, z: 0 },
      accelerationIncludingGravity: { x: 0, y: 9.8, z: null },
      rotationRate: null,
    });
    page.fire({ timeStamp: 6, interval: Number.NaN });

    expect(samples).toEqual([
      { t: 5, interval: 0, acceleration: null, gravityAcceleration: null, rotationRate: null },
      { t: 6, interval: 0, acceleration: null, gravityAcceleration: null, rotationRate: null },
    ]);
  });

  it("holds one devicemotion listener however many listeners are started, and fans out", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    const a = vi.fn<(sample: MotionSample) => void>();
    const b = vi.fn<(sample: MotionSample) => void>();

    const stopA = adapter.start(a);
    const stopB = adapter.start(b);
    expect(page.motionListenerCount()).toBe(1);

    page.fire(gyroEvent(1));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    stopA();
    page.fire(gyroEvent(2));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(page.motionListenerCount()).toBe(1);

    stopB();
    expect(page.motionListenerCount()).toBe(0);
    expect(page.visibilityListenerCount()).toBe(0);
  });

  it("ignores a second stop() call", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    const stop = adapter.start(() => {});
    const other = vi.fn<(sample: MotionSample) => void>();
    adapter.start(other);

    stop();
    stop();
    page.fire(gyroEvent(1));
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("starts a listener only once however often it is started", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    const listener = vi.fn<(sample: MotionSample) => void>();

    adapter.start(listener);
    adapter.start(listener);
    page.fire(gyroEvent(1));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("capability()", () => {
  it("is none before any data arrives", () => {
    expect(createBrowserAdapter(createFakePage().env).capability()).toBe("none");
  });

  it("is full once a rotation rate arrives", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    adapter.start(() => {});
    page.fire(gyroEvent(1));
    expect(adapter.capability()).toBe("full");
  });

  it("is accelerometer for a phone without a gyroscope, and a later empty event doesn't downgrade it", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    adapter.start(() => {});

    page.fire(gyroEvent(1, { rotationRate: null, acceleration: null }));
    expect(adapter.capability()).toBe("accelerometer");

    page.fire({ timeStamp: 2, acceleration: null, accelerationIncludingGravity: null });
    expect(adapter.capability()).toBe("accelerometer");
  });

  it("stays none when every field is null", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    adapter.start(() => {});
    page.fire({
      timeStamp: 1,
      interval: 16,
      acceleration: null,
      accelerationIncludingGravity: null,
      rotationRate: null,
    });
    expect(adapter.capability()).toBe("none");
  });
});

describe("visibility", () => {
  it("pauses when the page is hidden", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    const listener = vi.fn<(sample: MotionSample) => void>();
    adapter.start(listener);

    page.hide();
    expect(page.motionListenerCount()).toBe(0);
    page.fire(gyroEvent(1));
    expect(listener).not.toHaveBeenCalled();
  });

  it("resumes once visible when the resume tap starts it again, and doesn't re-add the listener on its own", async () => {
    const page = createFakePage({
      motionEvent: { requestPermission: () => Promise.resolve("granted") },
    });
    const adapter = createBrowserAdapter(page.env);
    const listener = vi.fn<(sample: MotionSample) => void>();
    adapter.start(listener);

    page.hide();
    page.show();
    // Rule 5: the controller shows "Tap to resume" instead of the adapter re-adding it by itself.
    expect(page.motionListenerCount()).toBe(0);

    // The "Tap to resume" handler.
    const permission = adapter.request();
    adapter.start(listener);
    await expect(permission).resolves.toBe("granted");

    expect(page.motionListenerCount()).toBe(1);
    page.fire(gyroEvent(2));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("resumes every listener that was started before the page was hidden", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    const detector = vi.fn<(sample: MotionSample) => void>();
    const controller = vi.fn<(sample: MotionSample) => void>();
    adapter.start(detector);

    page.hide();
    page.show();
    adapter.start(controller);
    page.fire(gyroEvent(1));

    expect(detector).toHaveBeenCalledTimes(1);
    expect(controller).toHaveBeenCalledTimes(1);
  });

  it("doesn't listen when started while hidden, and listens after a start while visible", () => {
    const page = createFakePage({ visibilityState: "hidden" });
    const adapter = createBrowserAdapter(page.env);
    const listener = vi.fn<(sample: MotionSample) => void>();

    adapter.start(listener);
    expect(page.motionListenerCount()).toBe(0);

    page.show();
    adapter.start(listener);
    expect(page.motionListenerCount()).toBe(1);
  });

  it("stops watching visibility once every listener stopped", () => {
    const page = createFakePage();
    const adapter = createBrowserAdapter(page.env);
    const stop = adapter.start(() => {});
    expect(page.visibilityListenerCount()).toBe(1);

    page.hide();
    stop();
    expect(page.visibilityListenerCount()).toBe(0);
    expect(page.motionListenerCount()).toBe(0);
  });
});
