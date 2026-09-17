import { createBrowserAdapter, createFakeAdapter } from "@couchcade/motion/sensors";
import type { FakeMotionAdapter, MotionAdapter, MotionPermission } from "@couchcade/motion/sensors";

// The one place the phone picks its sensor adapter (docs/architecture/motion.md, "Sensor
// adapter", rule 7). Playwright can't emulate motion sensors, so E2E tests set
// `window.__couchcadeMotion = { permission }` before the page loads (e2e/src/motion.ts). In dev
// and test builds this module then uses the fake adapter from @couchcade/motion, applies the
// permission and stores the fake on the global as `adapter`, where the test drives it. Production
// builds never read the global: the check sits behind `import.meta.env.DEV`, so the build drops it
// and the fake with it.

/** The global the E2E harness sets. */
export const motionHookName = "__couchcadeMotion";

/** What the test sets before load, plus the fake this module stores. */
export interface MotionHook {
  permission: MotionPermission;
  adapter?: FakeMotionAdapter;
}

const permissions: readonly MotionPermission[] = ["granted", "denied", "unsupported"];

/**
 * The fake adapter for a page that carries the hook, or null when it doesn't. The fake is created
 * once per page and stored on the hook, so every caller shares it.
 */
export function adapterFromHook(scope: object): FakeMotionAdapter | null {
  const hook = (scope as Record<string, unknown>)[motionHookName] as Partial<MotionHook> | null;
  if (typeof hook !== "object" || hook === null) return null;
  if (hook.adapter) return hook.adapter;
  const adapter = createFakeAdapter();
  if (hook.permission !== undefined && permissions.includes(hook.permission)) {
    adapter.setPermission(hook.permission);
  }
  hook.adapter = adapter;
  return adapter;
}

let shared: MotionAdapter | null = null;

/** The phone's sensor adapter, created on first use and shared by the whole app. */
export function motionAdapter(): MotionAdapter {
  shared ??= import.meta.env.DEV
    ? (adapterFromHook(globalThis) ?? createBrowserAdapter())
    : createBrowserAdapter();
  return shared;
}
