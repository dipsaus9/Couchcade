import { defineLibConfig } from "@couchcade/config/vite";
import vue from "@vitejs/plugin-vue";
import { configDefaults } from "vitest/config";

/**
 * The phone controller's component tests. jsdom is enough: they check rendered states, sent input
 * and text length, not computed CSS (that's CcBigAction's own browser-mode suite in @couchcade/ui),
 * the same split Strike Night's and Target Range's `vitest.config.ts` use.
 */
const controllerTests = "test/controller/**/*.test.ts";

// Rules, physics, view, snapshot and contract tests (test/*.test.ts) are pure TS running in Node.
// The controller's component tests run under jsdom. Add a browser project (see
// games/quick-draw/vitest.config.ts) once this game has a scene boot test. Neither project extends
// the root config, because `extends` would add the root `include` and run every test twice.
export default defineLibConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          exclude: [...configDefaults.exclude, controllerTests],
        },
      },
      {
        plugins: [vue()],
        test: { name: "controller", include: [controllerTests], environment: "jsdom" },
      },
    ],
  },
});
