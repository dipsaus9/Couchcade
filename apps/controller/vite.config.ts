import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { devPorts, defineAppConfig } from "@couchcade/config/vite";
import { toCssVars, toFontFaceCss } from "@couchcade/theme";
import vue from "@vitejs/plugin-vue";
import type { Plugin } from "vite";

const themeCssId = "virtual:couchcade-theme.css";

/**
 * Serves the theme's `@font-face` rules plus the token stylesheet (`:root { --cc-ink: … }`),
 * generated from `@couchcade/theme` at build time. It ships as a CSS file, so no token code runs
 * on the phone and the CSP (`style-src 'self'`) needs no inline styles.
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
 * middleware, and a build-time `emitFile` so they land, unhashed, in `dist/fonts/`. Mirrors
 * apps/host/vite.config.ts.
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

// The phone app, served at `/`. In `pnpm dev` the server dev server (:5173) proxies every path
// except `/api/*`, `/ws/*` and `/host/*` to this one (docs/architecture/platform.md). Its build
// output becomes the site root (apps/server copies it straight into dist/public), so the fonts
// this app emits at `/fonts/...` resolve for apps/host's pages too.
export default defineAppConfig(
  { base: "/", port: devPorts.controller },
  { plugins: [vue(), themeCss(), themeFonts()] },
);
