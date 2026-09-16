import { cloudflare } from "@cloudflare/vite-plugin";
import { defineWorkerConfig } from "@couchcade/config/vite";

// Local development: the Worker and the Room run inside this Vite dev server (decided by CC-1.3).
// Mount no other WebSocket server here. CC-1.11 and CC-1.12 add the proxy to the front-ends.
export default defineWorkerConfig({}, { plugins: [cloudflare()] });
