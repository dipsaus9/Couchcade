import { defineAppConfig, devPorts } from "@couchcade/config/vite";
import { toCssVars } from "@couchcade/theme";
import vue from "@vitejs/plugin-vue";
import type { Plugin } from "vite";

const themeCssId = "virtual:couchcade-theme.css";

/**
 * Serves the theme tokens as a stylesheet (`:root { --cc-ink: … }`), generated from
 * `@couchcade/theme` at build time. It ships as a CSS file, so no token code runs on the TV and the
 * CSP (`style-src 'self'`) needs no inline styles. Mirrors apps/controller/vite.config.ts.
 */
function themeCss(): Plugin {
  const resolvedId = `\0${themeCssId}`;
  return {
    name: "couchcade-theme-css",
    resolveId: (id) => (id === themeCssId ? resolvedId : undefined),
    load: (id) => (id === resolvedId ? toCssVars() : undefined),
  };
}

// The TV app, served under /host/. In development browsers reach it through the Worker's dev server
// on :5173, which proxies /host/* here (docs/architecture/platform.md, "Development topology").
export default defineAppConfig(
  { base: "/host/", port: devPorts.host },
  { plugins: [vue(), themeCss()] },
);
