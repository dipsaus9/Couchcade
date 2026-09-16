import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineAppConfig, devPorts } from "@couchcade/config/vite";
import { toCssVars, toFontFaceCss } from "@couchcade/theme";
import vue from "@vitejs/plugin-vue";
import type { Plugin } from "vite";

const themeCssId = "virtual:couchcade-theme.css";

/**
 * Serves the theme's `@font-face` rules plus the token stylesheet (`:root { --cc-ink: … }`),
 * generated from `@couchcade/theme` at build time. It ships as a CSS file, so no token code runs
 * on the TV and the CSP (`style-src 'self'`) needs no inline styles. Mirrors
 * apps/controller/vite.config.ts.
 */
function themeCss(): Plugin {
  const resolvedId = `\0${themeCssId}`;
  return {
    name: "couchcade-theme-css",
    resolveId: (id) => (id === themeCssId ? resolvedId : undefined),
    load: (id) => (id === resolvedId ? toFontFaceCss() + toCssVars() : undefined),
  };
}

const FONTS_DIR = fileURLToPath(new URL("../../packages/theme/fonts/", import.meta.url));

/** Fixed, unhashed request path -> source file, relative to FONTS_DIR. */
const THEME_FONT_FILES: ReadonlyArray<readonly [path: string, file: string]> = [
  ["/fonts/fredoka.woff2", "fredoka/fredoka.woff2"],
  ["/fonts/pixelify-sans.woff2", "pixelify-sans/pixelify-sans.woff2"],
];

/**
 * Serves the two self-hosted WOFF2 files (CC-4.3, subsetted by tooling/fonts) at the fixed paths
 * the theme's `@font-face` rules reference (`packages/theme/src/generate/fonts.ts`): a dev
 * middleware, and a build-time `emitFile` so they land, unhashed, in `dist/fonts/`. This app's own
 * build output ends up under apps/server's `dist/public/host/`, not the site root, but the CSS
 * URLs are absolute (`/fonts/...`) and apps/controller's build already puts the same two files at
 * the site root, so the TV page's requests resolve there regardless. Mirrors
 * apps/controller/vite.config.ts, so `pnpm --filter host dev` alone still serves them too.
 */
function themeFonts(): Plugin {
  return {
    name: "couchcade-theme-fonts",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const entry = THEME_FONT_FILES.find(([path]) => req.url === path);
        if (!entry) return next();
        res.setHeader("Content-Type", "font/woff2");
        res.end(readFileSync(`${FONTS_DIR}${entry[1]}`));
      });
    },
    generateBundle() {
      for (const [path, file] of THEME_FONT_FILES) {
        this.emitFile({
          type: "asset",
          fileName: path.slice(1),
          source: readFileSync(`${FONTS_DIR}${file}`),
        });
      }
    },
  };
}

// The TV app, served under /host/. In development browsers reach it through the Worker's dev server
// on :5173, which proxies /host/* here (docs/architecture/platform.md, "Development topology").
export default defineAppConfig(
  { base: "/host/", port: devPorts.host },
  { plugins: [vue(), themeCss(), themeFonts()] },
);
