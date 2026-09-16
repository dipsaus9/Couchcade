import {
  test as base,
  devices,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { injectFakeMotion, type MotionHookOptions } from "./motion.ts";

// Multi-device fixtures: one TV and N phones, each in its own browser context, so every device has
// its own storage, session and socket, like separate devices on the couch.

/** The TV. Screens are laid out on a 1920×1080 frame (apps/host/src/App.vue). */
const tvOptions: BrowserContextOptions = { viewport: { width: 1920, height: 1080 } };

/** A phone that runs the project's engine: Safari on an iPhone for WebKit, Chrome on Android else. */
function phoneOptions(browserName: string): BrowserContextOptions {
  const { defaultBrowserType: _, ...device } =
    browserName === "webkit" ? devices["iPhone 15"] : devices["Pixel 7"];
  return device;
}

export interface PhoneOptions {
  /** Installs the fake sensor adapter hook before the page loads (see src/motion.ts). */
  motion?: MotionHookOptions;
}

/** Opens `count` phones, each in a fresh context at the phone app (`/`). */
export type PhoneLauncher = (count: number, options?: PhoneOptions) => Promise<Page[]>;

export interface DeviceFixtures {
  /** The TV page, open at `/host/`. */
  host: Page;
  /** Opens phones. Every phone is closed when the test ends. */
  phones: PhoneLauncher;
}

export const test = base.extend<DeviceFixtures>({
  host: async ({ browser }, use) => {
    const context = await browser.newContext(tvOptions);
    const page = await context.newPage();
    await page.goto("/host/");
    await use(page);
    await context.close();
  },

  phones: async ({ browser, browserName }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (count, options = {}) => {
      const pages: Page[] = [];
      for (let i = 0; i < count; i++) {
        const context = await browser.newContext(phoneOptions(browserName));
        contexts.push(context);
        if (options.motion) await injectFakeMotion(context, options.motion);
        const page = await context.newPage();
        await page.goto("/");
        pages.push(page);
      }
      return pages;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect } from "@playwright/test";
