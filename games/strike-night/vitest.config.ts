import { defineLibConfig } from "@couchcade/config/vite";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults } from "vitest/config";

/** Tests that boot Phaser. They need a real browser: Phaser reads window, document and a canvas. */
const browserTests = "test/**/*.browser.test.ts";
/**
 * The phone controller's component tests. jsdom is enough: they check rendered states, sent input
 * and text length, not computed CSS (that's CcBigAction's own browser-mode suite in @couchcade/ui).
 */
const controllerTests = "test/controller/**/*.test.ts";

// Rules, physics, view, snapshot, contract, determinism, the recorded replay and the TV
// presentation (test/host/present.test.ts) run in Node. The TV scene's boot test runs in headless
// Chromium, the same Vitest browser mode setup as Quick Draw and Target Range. The controller's
// component tests run under jsdom. Neither the browser nor the controller project extends the root
// config, because `extends` would add the root `include` and run every test twice.
export default defineLibConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          exclude: [...configDefaults.exclude, browserTests, controllerTests],
          // The property and whole-match tests share CI's two cores with headless Chromium, which
          // makes them several times slower there than on a laptop.
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: "browser",
          // Phaser boots in software WebGL on CI, and two game suites share the runner, so the
          // 15 s default is too tight for a full round.
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
      {
        plugins: [vue()],
        test: { name: "controller", include: [controllerTests], environment: "jsdom" },
      },
    ],
  },
});
