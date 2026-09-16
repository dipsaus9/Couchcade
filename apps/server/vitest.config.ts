import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineWorkerConfig } from "@couchcade/config/vite";

// Tests run inside workerd with the bindings from wrangler.jsonc. Durable Object WebSocket tests
// need a single worker without isolation (docs/TECH_STACK.md).
export default defineWorkerConfig(
  {},
  {
    plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
    test: { maxWorkers: 1, isolate: false },
  },
);
