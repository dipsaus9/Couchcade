import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// Primary candidate: the Worker runs inside the Vite dev server via the Cloudflare plugin.
export default defineConfig({
  plugins: [cloudflare()],
});
