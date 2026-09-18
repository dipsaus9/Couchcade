import type { ControllerLink } from "./link.ts";

/**
 * The real-time link's test hook (docs/architecture/realtime-link.md, "Testing"). E2E can't reach
 * the `RTCPeerConnection` inside `runtime/link.ts` directly, so in dev and test builds `App.vue`
 * calls `exposeLinkTestHook` once at start, which puts the session's `ControllerLink` on
 * `window.__couchcadeLink`. `e2e/src/link.ts` reads `path` there and calls `cut()` to simulate a
 * dropped connection, the same pattern the motion sensor hook uses
 * (`apps/controller/src/motion/adapter.ts`, e2e/README.md "Motion sensors"). Production builds
 * never call this: the one call site sits behind `import.meta.env.DEV`.
 */

/** The global the E2E harness reads and drives: `window.__couchcadeLink`. */
export const linkHookName = "__couchcadeLink";

/** The hook's shape, as a test reads and drives it. */
export interface LinkTestHook {
  readonly path: ControllerLink["path"];
  cut(): void;
}

/** Puts `link` on the global for a test to read and drive. Call once per session. */
export function exposeLinkTestHook(link: ControllerLink): void {
  (globalThis as unknown as Record<string, LinkTestHook>)[linkHookName] = {
    get path() {
      return link.path;
    },
    cut: () => link.debugCut(),
  };
}
