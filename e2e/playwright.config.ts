import { devPorts } from "@couchcade/config/vite";
import { defineConfig } from "@playwright/test";
import { ensureDevVars } from "./src/dev-vars.ts";

// E2E runs against the local dev server, never a preview deploy (docs/TECH_STACK.md, "CI/CD").
// This config lives in e2e/ because @playwright/test is installed only in this package.

const ci = Boolean(process.env["CI"]);
const baseURL = `http://localhost:${devPorts.server}`;

ensureDevVars();

export default defineConfig({
  testDir: ".",
  testMatch: ["platform/**/*.spec.ts", "games/**/*.spec.ts"],
  globalSetup: "./src/global-setup.ts",
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // Every test opens a TV and several phones, so keep the dev server's load low.
  workers: ci ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    // Uploaded by .github/workflows/e2e.yml only when a run fails.
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    // `pnpm dev` serves everything on one origin: the TV at /host/ and the phone app at /.
    command: "pnpm --workspace-root run dev",
    // The host page goes through the Worker's proxy, so this waits for both dev servers it needs.
    url: `${baseURL}/host/`,
    reuseExistingServer: !ci,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
