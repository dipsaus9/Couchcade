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
  /**
   * Entries put in the phone's `sessionStorage` before the page loads, for example a stored
   * `couchcade:session` to reopen a phone as the same player.
   */
  sessionStorage?: Record<string, string>;
  /** Runs on the new page before it loads, for example to listen for its sockets. */
  beforeLoad?(page: Page): void;
  /** Query string appended to the phone's URL, such as `?link=1` (src/link.ts, CC-3.22). */
  search?: string;
}

/** Opens `count` phones, each in a fresh context at the phone app (`/`). */
export type PhoneLauncher = (count: number, options?: PhoneOptions) => Promise<Page[]>;

export interface DeviceFixtures {
  /** The TV page, open at `/host/`. */
  host: Page;
  /** Opens phones. Every phone is closed when the test ends. */
  phones: PhoneLauncher;
}

export interface DeviceOptions {
  /** Query string appended to the TV's URL, such as `?link=1` (src/link.ts, CC-3.22). Set with
   * `test.use({ hostSearch: "?link=1" })`. */
  hostSearch: string;
}

export const test = base.extend<DeviceFixtures & DeviceOptions>({
  hostSearch: ["", { option: true }],

  host: async ({ browser, hostSearch }, use) => {
    const context = await browser.newContext(tvOptions);
    const page = await context.newPage();
    await page.goto(`/host/${hostSearch}`);
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
        if (options.sessionStorage) {
          await context.addInitScript((entries) => {
            for (const [key, value] of Object.entries(entries)) {
              // Only when missing, so a reload inside the test keeps what the app stored since.
              if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, value);
            }
          }, options.sessionStorage);
        }
        const page = await context.newPage();
        options.beforeLoad?.(page);
        await page.goto(`/${options.search ?? ""}`);
        pages.push(page);
      }
      return pages;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect } from "@playwright/test";
