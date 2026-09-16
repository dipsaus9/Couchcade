import type {
  BrowserMotionEnv,
  DeviceMotionEventLike,
  DeviceMotionEventStaticLike,
} from "@couchcade/motion/sensors";

type Handler = (event: DeviceMotionEventLike) => void;

export interface FakePageOptions {
  /** The `DeviceMotionEvent` constructor, or `undefined` for a browser without motion events. */
  motionEvent?: DeviceMotionEventStaticLike | undefined;
  secure?: boolean;
  /** Omit for a browser without `navigator.userActivation`. */
  userActivation?: { isActive: boolean };
  visibilityState?: "visible" | "hidden";
}

/** A fake window and document for the browser adapter, with switches for visibility. */
export function createFakePage(options: FakePageOptions = {}) {
  const motionListeners = new Set<Handler>();
  const visibilityListeners = new Set<() => void>();
  const document = {
    visibilityState: options.visibilityState ?? "visible",
    addEventListener: (_type: "visibilitychange", listener: () => void) => {
      visibilityListeners.add(listener);
    },
    removeEventListener: (_type: "visibilitychange", listener: () => void) => {
      visibilityListeners.delete(listener);
    },
  };
  const env: BrowserMotionEnv = {
    window: {
      addEventListener: (_type, listener) => {
        motionListeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        motionListeners.delete(listener);
      },
    },
    document,
    DeviceMotionEvent: "motionEvent" in options ? options.motionEvent : {},
    isSecureContext: options.secure ?? true,
    userActivation: options.userActivation,
  };

  const setVisibility = (state: "visible" | "hidden") => {
    document.visibilityState = state;
    for (const listener of visibilityListeners) listener();
  };

  return {
    env,
    /** Dispatches a `devicemotion` event to the page's listeners. */
    fire(event: DeviceMotionEventLike) {
      for (const listener of motionListeners) listener(event);
    },
    hide: () => setVisibility("hidden"),
    show: () => setVisibility("visible"),
    motionListenerCount: () => motionListeners.size,
    visibilityListenerCount: () => visibilityListeners.size,
  };
}

/** A `devicemotion` event from a phone with a gyroscope. */
export function gyroEvent(timeStamp: number, overrides: Partial<DeviceMotionEventLike> = {}) {
  return {
    timeStamp,
    interval: 16,
    acceleration: { x: 0.1, y: -0.2, z: 0.3 },
    accelerationIncludingGravity: { x: 0.1, y: 6.9, z: -6.9 },
    rotationRate: { alpha: 12, beta: -4, gamma: 1.5 },
    ...overrides,
  } satisfies DeviceMotionEventLike;
}
