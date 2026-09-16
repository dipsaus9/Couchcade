import { devPorts, defineAppConfig } from "@couchcade/config/vite";
import { toCssVars } from "@couchcade/theme";
import vue from "@vitejs/plugin-vue";
import type { Plugin } from "vite";

const themeCssId = "virtual:couchcade-theme.css";

/**
 * Serves the theme tokens as a stylesheet (`:root { --cc-ink: … }`), generated from
 * `@couchcade/theme` at build time. It ships as a CSS file, so no token code runs on the phone
 * and the CSP (`style-src 'self'`) needs no inline styles.
 */
function themeCss(): Plugin {
  const resolvedId = `\0${themeCssId}`;
  return {
    name: "couchcade-theme-css",
    resolveId: (id) => (id === themeCssId ? resolvedId : undefined),
    load: (id) => (id === resolvedId ? toCssVars() : undefined),
  };
}

// The phone app, served at `/`. In `pnpm dev` the server dev server (:5173) proxies every path
// except `/api/*`, `/ws/*` and `/host/*` to this one (docs/architecture/platform.md).
export default defineAppConfig(
  { base: "/", port: devPorts.controller },
  { plugins: [vue(), themeCss()] },
);
