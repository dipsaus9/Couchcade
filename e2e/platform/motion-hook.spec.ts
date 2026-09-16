import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { motionHookName } from "../src/motion.ts";

/** The fake motion permission a page's hook carries, or null when the page has no hook. */
function hookPermission(page: Page): Promise<string | null> {
  return page.evaluate((name) => {
    const hook = (window as unknown as Record<string, { permission: string } | undefined>)[name];
    return hook?.permission ?? null;
  }, motionHookName);
}

// The controller doesn't read the hook until CC-5.10. This checks the harness half: the global is
// on the phone before the controller's own scripts run, after every load, and only when asked.
test("a phone launched with fake motion has the sensor hook before the app starts", async ({
  phones,
}) => {
  const [withMotion] = await phones(1, { motion: { permission: "denied" } });
  const [withoutMotion] = await phones(1);
  if (!withMotion || !withoutMotion) throw new Error("expected two phones");

  expect(await hookPermission(withMotion)).toBe("denied");
  await withMotion.reload();
  expect(await hookPermission(withMotion)).toBe("denied");
  expect(await hookPermission(withoutMotion)).toBeNull();
});
