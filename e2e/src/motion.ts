import type { BrowserContext, Page } from "@playwright/test";

// The sensor adapter injection hook (docs/architecture/motion.md, "Sensor adapter", rule 7).
// Playwright can't emulate motion sensors, so a test puts this global on the phone before any
// page script runs. In dev and test builds the controller's adapter module
// (apps/controller/src/motion/adapter.ts, CC-5.10) sees it, creates the fake adapter from
// @couchcade/motion instead of the browser one, applies `permission` and stores the fake on
// `adapter`. Production builds never read the global.

/** The global the controller reads: `window.__couchcadeMotion`. */
export const motionHookName = "__couchcadeMotion";

export type MotionPermission = "granted" | "denied" | "unsupported";

/** One `devicemotion` reading, shaped like `MotionSample` in motion.md. */
export interface MotionSample {
  t: number;
  interval: number;
  acceleration: { x: number; y: number; z: number } | null;
  gravityAcceleration: { x: number; y: number; z: number } | null;
  rotationRate: { alpha: number; beta: number; gamma: number } | null;
}

/** A recorded or synthetic trace as JSON (motion.md, "Trace format"). */
export type MotionTrace = { v: 1; samples: unknown[] } & Record<string, unknown>;

/** What the test sets before load. The controller adds `adapter` when it picks the fake. */
export interface MotionHookOptions {
  /** What the fake adapter's `request()` resolves to. */
  permission: MotionPermission;
}

/** The global as the controller leaves it: the options plus the fake adapter it created. */
interface MotionHook extends MotionHookOptions {
  adapter?: {
    setPermission(result: MotionPermission): void;
    push(sample: MotionSample): void;
    play(trace: MotionTrace, options?: { speed?: number }): Promise<void>;
  };
}

/** `window`, seen as a record so the hook is read by name inside the page. */
type HookWindow = Record<string, MotionHook | undefined>;

/** Installs the hook on every page of a phone's context, before the controller's scripts run. */
export async function injectFakeMotion(
  context: BrowserContext,
  options: MotionHookOptions,
): Promise<void> {
  await context.addInitScript(
    ({ name, hook }) => {
      (window as unknown as Record<string, unknown>)[name] = { ...hook };
    },
    { name: motionHookName, hook: options },
  );
}

/** Pushes one sample into the phone's fake adapter. Waits until the controller created it. */
export async function pushMotionSample(phone: Page, sample: MotionSample): Promise<void> {
  await waitForFakeAdapter(phone);
  await phone.evaluate(({ name, s }) => (window as unknown as HookWindow)[name]?.adapter?.push(s), {
    name: motionHookName,
    s: sample,
  });
}

/** Plays a trace into the phone's fake adapter on its timestamps, and resolves when it ends. */
export async function playMotionTrace(
  phone: Page,
  trace: MotionTrace,
  options: { speed?: number } = {},
): Promise<void> {
  await waitForFakeAdapter(phone);
  await phone.evaluate(
    ({ name, t, o }) => (window as unknown as HookWindow)[name]?.adapter?.play(t, o),
    { name: motionHookName, t: trace, o: options },
  );
}

async function waitForFakeAdapter(phone: Page): Promise<void> {
  await phone.waitForFunction(
    (name) => (window as unknown as HookWindow)[name]?.adapter !== undefined,
    motionHookName,
  );
}
