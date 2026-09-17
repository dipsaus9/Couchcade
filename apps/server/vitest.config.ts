import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineWorkerConfig } from "@couchcade/config/vite";

// Test-only secrets. They exist only in this test pool and are never used anywhere else.
const testSecrets = {
  HOST_PASSCODE: "test-only-passcode",
  TICKET_SIGNING_SECRET: "test-only-ticket-signing-secret-0123456789",
  // Cloudflare's Turnstile test secret that passes every token (security.md, "Where Turnstile runs").
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  SMOKE_TOKEN: "test-only-smoke-token-0123456789abcdef",
};

// Tests run inside workerd with the bindings from wrangler.jsonc. Durable Object WebSocket tests
// need a single worker without isolation (docs/TECH_STACK.md). Siteverify is answered by a
// stand-in (test/siteverify.ts), so no test needs the network.
export default defineWorkerConfig(
  {},
  {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: testSecrets },
      }),
    ],
    test: { maxWorkers: 1, isolate: false, setupFiles: ["./test/siteverify.ts"] },
  },
);
