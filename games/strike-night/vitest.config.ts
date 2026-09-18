import { defineLibConfig } from "@couchcade/config/vite";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults } from "vitest/config";

/** Tests that boot Phaser. They need a real browser: Phaser reads window, document and a canvas. */
const browserTests = "test/**/*.browser.test.ts";

// Rules, physics, view, snapshot, contract, determinism, the recorded replay and the TV
// presentation (test/host/present.test.ts) run in Node. The TV scene's boot test (CC-12.4) runs
// in headless Chromium, the same Vitest browser mode setup as Quick Draw and Target Range. CC-12.3
// adds a jsdom controller project here too, on its own branch; a merge reconciles the two.
export default defineLibConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          exclude: [...configDefaults.exclude, browserTests],
          // The property and whole-match tests share CI's two cores, which makes them several
          // times slower there than on a laptop.
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: "browser",
          // Phaser boots in software WebGL on CI, and two game suites share the runner, so the
          // 15 s default is too tight for a whole match's worth of ticks.
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
