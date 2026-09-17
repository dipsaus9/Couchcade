import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";

// The TV lag check (docs/architecture/session-flow.md, "TV lag calibration"). The laptop starts it
// from the TV lobby, every phone gets a big button to tap along with the flash, and it can be
// skipped from the VIP's phone or the TV. Nobody keeps the beat here, so the TV offers a retry and
// the stored value never changes.

test("the TV lag check gives phones a tap button and can be skipped from the phone and the TV", async ({
  host,
  phones,
}) => {
  test.setTimeout(90_000);

  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  if (!ana || !ben) throw new Error("expected two phones");
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await expect(ana.getByRole("button", { name: "Choose a game" })).toBeVisible();

  const checkTvLag = host.getByRole("button", { name: "Check TV lag" });
  await checkTvLag.click();
  await expect(host.getByRole("heading", { name: "Check the TV lag" })).toBeVisible();
  for (const phone of [ana, ben]) {
    await expect(phone.getByRole("button", { name: "Tap with the flash" })).toBeVisible();
  }
  // Only the VIP can skip from their phone.
  await expect(ana.getByRole("button", { name: "Skip" })).toBeVisible();
  await expect(ben.getByRole("button", { name: "Skip" })).toHaveCount(0);

  // One tap is not enough for a value, so the TV asks to try again when the flashes end.
  await ben.getByRole("button", { name: "Tap with the flash" }).tap();
  await expect(host.getByText("Let's try that again")).toBeVisible({ timeout: 20_000 });
  await expect(ben.getByRole("button", { name: "Watch the TV" })).toBeVisible();

  await host.getByRole("button", { name: "Try again" }).click();
  await expect(ben.getByRole("button", { name: "Tap with the flash" })).toBeVisible();

  // The VIP skips from their phone: everyone is back in the lobby, and no value was stored.
  await ana.getByRole("button", { name: "Skip" }).tap();
  await expect(checkTvLag).toBeVisible();
  await expect(host.getByText(/^TV lag \d+ ms$/)).toHaveCount(0);
  await expect(ana.getByRole("button", { name: "Choose a game" })).toBeVisible();

  // And "Skip" on the TV while the flashes run.
  await checkTvLag.click();
  await expect(ben.getByRole("button", { name: "Tap with the flash" })).toBeVisible();
  await host.getByRole("button", { name: "Skip" }).click();
  await expect(checkTvLag).toBeVisible();
  await expect(ana.getByRole("button", { name: "Choose a game" })).toBeVisible();
});
