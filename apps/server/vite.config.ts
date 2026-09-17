import { cloudflare } from "@cloudflare/vite-plugin";
import { defineWorkerConfig, devPorts } from "@couchcade/config/vite";

/**
 * Every rate limit's count per minute under `pnpm dev`. The dev server keys every request by
 * 127.0.0.1, and one E2E run creates far more than 3 rooms a minute from it. Deploys read
 * wrangler.jsonc directly and never load this file, so production keeps the limits from
 * docs/architecture/security.md. The Worker code is the same in both: there is no bypass.
 */
const devRateLimit = 1000;

// Local development: the Worker and the Room run inside this Vite dev server (decided by CC-1.3).
// Mount no other WebSocket server here. Browsers only talk to this port: the Worker answers /api/*
// and /ws/*, and plain HTTP proxies forward the front-ends to their own dev servers
// (docs/architecture/platform.md, "Development topology"). The proxies never carry WebSockets,
// so each app's HMR socket connects straight to its own port.
export default defineWorkerConfig(
  {},
  {
    plugins: [
      cloudflare({
        // Changed in place: the plugin merges a returned object into the file's config and would
        // append a second copy of each binding instead of replacing it.
        config(worker) {
          for (const binding of worker.ratelimits) binding.simple.limit = devRateLimit;
        },
      }),
    ],
    server: {
      proxy: {
        "^/host(/|$)": { target: `http://localhost:${devPorts.host}` },
        "^/(?!api/|ws/|host(/|$))": { target: `http://localhost:${devPorts.controller}` },
      },
    },
  },
);
