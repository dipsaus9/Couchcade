import { defineLibConfig } from "@couchcade/config/vite";
import vue from "@vitejs/plugin-vue";
import { configDefaults } from "vitest/config";

/**
 * The phone controller's component tests (CC-12.3). jsdom is enough: they check rendered states,
 * sent input and text length, not computed CSS (that's CcBigAction's own browser-mode suite in
 * @couchcade/ui).
 */
const controllerTests = "test/controller/**/*.test.ts";

// Rules, physics, view, snapshot, contract, determinism and the recorded replay run in Node. The
// controller's component tests run under jsdom. CC-12.4 adds a browser project here for the TV
// scene's boot test, the same way games/quick-draw/vitest.config.ts does. Neither project extends
// the root config, because `extends` would add the root `include` and run every test twice.
export default defineLibConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          exclude: [...configDefaults.exclude, controllerTests],
          // The property and whole-match tests share CI's two cores, which makes them several
          // times slower there than on a laptop.
          testTimeout: 60_000,
        },
      },
      {
        plugins: [vue()],
        test: { name: "controller", include: [controllerTests], environment: "jsdom" },
      },
    ],
  },
});
