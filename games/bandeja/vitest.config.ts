import { defineLibConfig } from "@couchcade/config/vite";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults } from "vitest/config";

/** Tests that boot Phaser. They need a real browser: Phaser reads window, document and a canvas. */
const browserTests = "test/**/*.browser.test.ts";

// Rules, flight, view, snapshot, contract, determinism, the recorded replay and the TV
// presentation run in Node. The TV scene's boot test (CC-23.4) runs in headless Chromium, the
// same Vitest browser mode setup Quick Draw, Target Range and Strike Night use. Doesn't `extends`
// the root config for the browser project, because `extends` would add the root `include` and run
// every test twice.
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
          // Phaser boots in software WebGL on CI, and game suites share the runner, so the 15 s
          // default is too tight for a full match.
          testTimeout: 60_000,
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
