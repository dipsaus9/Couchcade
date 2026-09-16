import { defineConfig } from "vite";

// Fallback candidate: `wrangler dev` on :8787, with Vite proxying API and WebSocket traffic to it.
export default defineConfig({
  server: {
    proxy: {
      "/parties": { target: "http://127.0.0.1:8787", ws: true },
      "/api": { target: "http://127.0.0.1:8787" },
    },
  },
});
