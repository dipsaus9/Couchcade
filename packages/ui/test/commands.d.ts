// Custom browser commands registered in vitest.config.ts.

/** Switches `prefers-reduced-motion` for the page the tests run in. */
export type EmulateReducedMotion = (reduce: boolean) => Promise<void>;

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateReducedMotion: EmulateReducedMotion;
  }
}
