/**
 * The browser sensor adapter (docs/architecture/motion.md, "Sensor adapter"). The only code in the
 * repo that touches `DeviceMotionEvent`: one `devicemotion` source on iPhone and Android, no
 * Generic Sensor API, no `deviceorientation`.
 *
 * ```ts
 * const adapter = createBrowserAdapter();
 * button.addEventListener("click", async () => {
 *   const permission = await adapter.request(); // asks inside the tap
 *   if (permission === "granted") stop = adapter.start(onSample);
 * });
 * ```
 *
 * Everything it reads from the page comes in through `BrowserMotionEnv`, so unit tests run it
 * against a fake window and document.
 */
import { bestCapability, sampleCapability, toMotionSample } from "./sample.ts";
import type { DeviceMotionEventLike } from "./sample.ts";
import type { MotionAdapter, MotionCapability, MotionListener, MotionPermission } from "./types.ts";

type DeviceMotionHandler = (event: DeviceMotionEventLike) => void;

/** The page's `window`, as far as the adapter uses it. */
export interface MotionWindowLike {
  addEventListener(type: "devicemotion", listener: DeviceMotionHandler): void;
  removeEventListener(type: "devicemotion", listener: DeviceMotionHandler): void;
}

/** The page's `document`, as far as the adapter uses it. */
export interface VisibilityDocumentLike {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** The `DeviceMotionEvent` constructor. `requestPermission` exists on iOS 13+ and Chrome 151+. */
export interface DeviceMotionEventStaticLike {
  requestPermission?: () => Promise<string>;
}

export interface BrowserMotionEnv {
  window: MotionWindowLike;
  document: VisibilityDocumentLike;
  /** `undefined` where the browser has no motion events at all. */
  DeviceMotionEvent: DeviceMotionEventStaticLike | undefined;
  /** Sensors only work on HTTPS pages. */
  isSecureContext: boolean;
  /** `navigator.userActivation`, where the browser has it (Chrome, Safari 16.4+). */
  userActivation?: { readonly isActive: boolean } | undefined;
}

/** The real page. Only call this in a browser. */
export function browserMotionEnv(): BrowserMotionEnv {
  const scope = globalThis as unknown as {
    DeviceMotionEvent?: DeviceMotionEventStaticLike;
    navigator?: { userActivation?: { readonly isActive: boolean } };
  };
  return {
    window: globalThis.window,
    document: globalThis.document,
    DeviceMotionEvent: scope.DeviceMotionEvent,
    isSecureContext: globalThis.isSecureContext === true,
    userActivation: scope.navigator?.userActivation,
  };
}

/**
 * Creates the adapter for the real page, or for `env` in tests.
 *
 * - `request()` calls `DeviceMotionEvent.requestPermission()` synchronously, so the call stays
 *   inside the tap that called `request()`. Nothing else in the adapter ever calls it. Outside a
 *   user gesture (where the browser can tell) it doesn't call it and reports `unsupported`, which
 *   is what the browser's own `NotAllowedError` would have become.
 * - `start()` holds one `devicemotion` listener however many listeners are started.
 * - When the page is hidden, the adapter removes that listener and keeps the started listeners.
 *   It doesn't add it back by itself (motion.md adapter rule 5). Once the page is visible again,
 *   the "Tap to resume" handler calls `request()` and `start()`, and every started listener gets
 *   samples again. Starting a listener that is already started doesn't add it twice.
 */
export function createBrowserAdapter(env: BrowserMotionEnv = browserMotionEnv()): MotionAdapter {
  const listeners = new Set<MotionListener>();
  let listening = false;
  let best: MotionCapability = "none";

  const onMotion: DeviceMotionHandler = (event) => {
    const sample = toMotionSample(event);
    best = bestCapability(best, sampleCapability(sample));
    for (const listener of listeners) listener(sample);
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    env.window.addEventListener("devicemotion", onMotion);
  };

  const pause = () => {
    if (!listening) return;
    listening = false;
    env.window.removeEventListener("devicemotion", onMotion);
  };

  const onVisibilityChange = () => {
    if (env.document.visibilityState === "hidden") pause();
  };

  return {
    request(): Promise<MotionPermission> {
      const motionEvent = env.DeviceMotionEvent;
      if (!motionEvent || !env.isSecureContext) return Promise.resolve("unsupported");
      const requestPermission = motionEvent.requestPermission;
      if (typeof requestPermission !== "function") return Promise.resolve("granted");
      if (env.userActivation && !env.userActivation.isActive) return Promise.resolve("unsupported");

      // No await before this call: an await would end the user gesture.
      let answer: Promise<string>;
      try {
        answer = requestPermission.call(motionEvent);
      } catch {
        return Promise.resolve("unsupported");
      }
      return Promise.resolve(answer).then(
        (state): MotionPermission => (state === "granted" ? "granted" : "denied"),
        (): MotionPermission => "unsupported",
      );
    },

    start(listener) {
      if (listeners.size === 0) {
        env.document.addEventListener("visibilitychange", onVisibilityChange);
      }
      listeners.add(listener);
      if (env.document.visibilityState !== "hidden") listen();

      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        if (!listeners.delete(listener) || listeners.size > 0) return;
        pause();
        env.document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    },

    capability: () => best,
  };
}
