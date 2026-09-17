import { defineLibConfig } from "@couchcade/config/vite";

export default defineLibConfig({
  // Builds two real apps with the Vite API; slower than a pure unit test.
  test: { testTimeout: 30_000 },
});
