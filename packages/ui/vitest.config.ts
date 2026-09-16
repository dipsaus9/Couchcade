import { defineLibConfig } from "@couchcade/config/vite";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";
import type { BrowserCommand } from "vitest/node";

/** Switches `prefers-reduced-motion` for the page the tests run in. */
const emulateReducedMotion: BrowserCommand<[reduce: boolean]> = async (context, reduce) => {
  if (context.provider.name !== "playwright") throw new Error("Needs the Playwright provider");
  await context.page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
};

// Component tests run in real Chromium: axe-core needs computed styles and layout to check
// colour contrast, which jsdom and happy-dom can't provide.
export default defineLibConfig({
  plugins: [vue()],
  test: {
    setupFiles: ["test/setup.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      commands: { emulateReducedMotion },
    },
  },
});
