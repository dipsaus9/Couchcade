import { defineLibConfig } from "@couchcade/config/vite";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults } from "vitest/config";

/** Tests that boot Phaser. They need a real browser: Phaser reads window, document and a canvas. */
const browserTests = "test/**/*.browser.test.ts";

// Rules, flight, view, snapshot, contract, determinism, the recorded replay and the TV
// presentation run in Node. The TV scene's boot tests run in headless Chromium, with the same
// Vitest browser mode setup as Quick Draw and @couchcade/ui. The browser project doesn't extend
// the root config, because `extends` would add the root `include` and run every test twice.
export default defineLibConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", exclude: [...configDefaults.exclude, browserTests] },
      },
      {
        test: {
          name: "browser",
          include: [browserTests],
          browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
