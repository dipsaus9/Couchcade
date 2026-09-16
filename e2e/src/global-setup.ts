import type { FullConfig } from "@playwright/test";

// Pages behind the Worker's proxy: /host/ reaches the host dev server, / the controller's.
const appPaths = ["/host/", "/"];
const readyTimeoutMs = 60_000;

/**
 * Runs after Playwright's webServer is up. The webServer only waits for one URL, so this waits
 * until the proxy answers 200 for both front-ends before the first test opens a device.
 */
export default async function waitForApps(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("playwright.config.ts must set use.baseURL");
  const deadline = Date.now() + readyTimeoutMs;
  for (const path of appPaths) {
    const url = new URL(path, baseURL);
    while (!(await answers(url))) {
      if (Date.now() > deadline) throw new Error(`The dev server never served ${url.href}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function answers(url: URL): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
