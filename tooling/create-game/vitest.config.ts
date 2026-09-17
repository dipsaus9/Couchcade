import { defineLibConfig } from "@couchcade/config/vite";

// The generator's own tests run in Node. The integration test spawns real `pnpm --filter`
// processes and can take longer than Vitest's default 5s per test on a cold cache.
export default defineLibConfig({ test: { testTimeout: 120_000 } });
