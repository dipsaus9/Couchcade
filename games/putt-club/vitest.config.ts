import { defineLibConfig } from "@couchcade/config/vite";
import vue from "@vitejs/plugin-vue";
import { configDefaults } from "vitest/config";

/**
 * The phone controller's component tests. jsdom is enough: they check rendered states, sent input
 * and text length, not computed CSS (that's CcBigAction's own browser-mode suite in @couchcade/ui),
 * the same split Strike Night's, Target Range's and Bandeja's `vitest.config.ts` use.
 */
const controllerTests = "test/controller/**/*.test.ts";

// Rules, flight, view, snapshot, contract, determinism and the recorded replay run in Node. Add a
// browser project (see games/bandeja/vitest.config.ts) once CC-13.4 gives this game a TV scene to
// boot. Neither the controller project extends the root config, because `extends` would add the
// root `include` and run every test twice.
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
