import { cloudflare } from "@cloudflare/vite-plugin";
import { defineWorkerConfig, devPorts } from "@couchcade/config/vite";

// Local development: the Worker and the Room run inside this Vite dev server (decided by CC-1.3).
// Mount no other WebSocket server here. Browsers only talk to this port: the Worker answers /api/*
// and /ws/*, and plain HTTP proxies forward the front-ends to their own dev servers
// (docs/architecture/platform.md, "Development topology"). The proxies never carry WebSockets,
// so each app's HMR socket connects straight to its own port.
export default defineWorkerConfig(
  {},
  {
    plugins: [cloudflare()],
    server: {
      proxy: {
        "^/host(/|$)": { target: `http://localhost:${devPorts.host}` },
        "^/(?!api/|ws/|host(/|$))": { target: `http://localhost:${devPorts.controller}` },
      },
    },
  },
);
