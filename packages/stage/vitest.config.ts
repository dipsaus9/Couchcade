import { defineLibConfig } from "@couchcade/config/vite";
import { playwright } from "@vitest/browser-playwright";

// Boot tests run Phaser in real Chromium: the overlays need a canvas, fonts and a renderer
// to read pixels back from, which Node can't provide.
export default defineLibConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
