import { mergeConfig } from "vite";
import type { ViteUserConfig } from "vitest/config";

/**
 * Dev server ports. Browsers only talk to `server` (the Worker plus the Cloudflare Vite plugin),
 * which proxies `/host/*` to `host` and everything else to `controller`.
 * See docs/architecture/platform.md, "Development topology".
 */
export const devPorts = {
  server: 5173,
  host: 5174,
  controller: 5175,
} as const;

/** Vitest defaults shared by every package. Unit tests live in each package's `test/`. */
export const testDefaults = {
  include: ["test/**/*.test.ts"],
  environment: "node",
  passWithNoTests: true,
} satisfies NonNullable<ViteUserConfig["test"]>;

export interface AppConfigOptions {
  /** Public base path: `/host/` for the TV app, `/` for the phone app. */
  base: string;
  /** Dev server port, one of `devPorts`. */
  port: number;
}

export interface WorkerConfigOptions {
  /** Dev server port. Defaults to `devPorts.server`. */
  port?: number;
}

/** Vitest config for a package or app. */
export function defineTestConfig(overrides: ViteUserConfig = {}): ViteUserConfig {
  return mergeConfig({ test: testDefaults }, overrides);
}

/** Vite config for an internal library. Internal packages have no build step, only tests. */
export function defineLibConfig(overrides: ViteUserConfig = {}): ViteUserConfig {
  return defineTestConfig(overrides);
}

/**
 * Vite config for a front-end app (host or controller). Its HMR socket connects straight to its
 * own port, so no extra WebSocket runs through the Worker's dev server.
 */
export function defineAppConfig(
  { base, port }: AppConfigOptions,
  overrides: ViteUserConfig = {},
): ViteUserConfig {
  return defineTestConfig(
    mergeConfig(
      {
        base,
        server: { port, strictPort: true, hmr: { clientPort: port } },
        preview: { port, strictPort: true },
        build: { outDir: "dist", emptyOutDir: true },
      } satisfies ViteUserConfig,
      overrides,
    ),
  );
}

/**
 * Vite config for the Worker (`apps/server`). The caller adds the Cloudflare Vite plugin and the
 * proxy to the front-end dev servers. Mount no other WebSocket server on this dev server.
 */
export function defineWorkerConfig(
  { port = devPorts.server }: WorkerConfigOptions = {},
  overrides: ViteUserConfig = {},
): ViteUserConfig {
  return defineTestConfig(
    mergeConfig(
      {
        server: { port, strictPort: true },
        preview: { port, strictPort: true },
      } satisfies ViteUserConfig,
      overrides,
    ),
  );
}
