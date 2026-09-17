import { defineLibConfig } from "@couchcade/config/vite";
import vue from "@vitejs/plugin-vue";
import { configDefaults } from "vitest/config";

/**
 * The phone controller's component tests. jsdom is enough: they check rendered states, sent input
 * and text length, not computed CSS (that's CcBigAction's own browser-mode suite in @couchcade/ui).
 */
const controllerTests = "test/controller/**/*.test.ts";

// Rules, flight, view, snapshot, contract, determinism and the recorded replay run in Node. The
// controller's component tests run under jsdom, in a project that doesn't extend the root config,
// because `extends` would add the root `include` and run every test twice. Add a browser project
// (see games/quick-draw/vitest.config.ts) once CC-11.4 adds a scene boot test.
export default defineLibConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", exclude: [...configDefaults.exclude, controllerTests] },
      },
      {
        plugins: [vue()],
        test: { name: "controller", include: [controllerTests], environment: "jsdom" },
      },
    ],
  },
});
