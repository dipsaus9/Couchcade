import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineWorkerConfig } from "@couchcade/config/vite";

// Test-only secrets. They exist only in this test pool and are never used anywhere else.
const testSecrets = {
  HOST_PASSCODE: "test-only-passcode",
  TICKET_SIGNING_SECRET: "test-only-ticket-signing-secret-0123456789",
};

// Tests run inside workerd with the bindings from wrangler.jsonc. Durable Object WebSocket tests
// need a single worker without isolation (docs/TECH_STACK.md).
export default defineWorkerConfig(
  {},
  {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: testSecrets },
      }),
    ],
    test: { maxWorkers: 1, isolate: false },
  },
);
