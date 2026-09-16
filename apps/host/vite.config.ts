import vue from "@vitejs/plugin-vue";
import { defineAppConfig, devPorts } from "@couchcade/config/vite";

// The TV app, served under /host/. In development browsers reach it through the Worker's dev server
// on :5173, which proxies /host/* here (docs/architecture/platform.md, "Development topology").
export default defineAppConfig({ base: "/host/", port: devPorts.host }, { plugins: [vue()] });
