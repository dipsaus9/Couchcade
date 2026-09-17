import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";

// The host stays in control of who plays (docs/architecture/security.md): Kick on a TV lobby card
// closes that phone with 4003 and shows it the Kicked screen, and Lock room answers new joins with
// 423, which the phone explains as "Room is locked".

test("the host kicks a phone from the TV lobby and locks the room against new joins", async ({
  host,
  phones,
}) => {
  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  if (!ana || !ben) throw new Error("expected two phones");
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");

  const players = host.getByRole("region", { name: "Players" });
  await expect(players.getByText("2/8")).toBeVisible();

  // Kick shows when the host points at a player's card.
  await players.locator("article", { hasText: "Ana" }).hover();
  await players.getByRole("button", { name: "Kick Ana" }).click();

  await expect(ana.getByRole("heading", { name: "Kicked" })).toBeVisible();
  await expect(ana.getByText(`The host removed you from room ${code}.`)).toBeVisible();
  await expect(players.getByText("1/8")).toBeVisible();
  await expect(players.getByText("Ana", { exact: true })).toBeHidden();
  await expect(ben.getByRole("heading", { name: "You're in, Ben" })).toBeVisible();

  // Locked: a new join gets the referee-voice message.
  const lock = host.getByRole("button", { name: "Lock room" });
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect(players.getByText("Room locked")).toBeVisible();

  await ana.getByRole("button", { name: "Join another room" }).click();
  await ana.getByLabel("Room code").fill(code);
  await ana.getByLabel("Your name").fill("Ana");
  await ana.getByRole("button", { name: "Join" }).click();
  await expect(
    ana.getByText("Room is locked. Ask the host to unlock it, then try again."),
  ).toBeVisible();

  // Unlocked again, the same phone joins as a new player.
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await ana.getByRole("button", { name: "Join" }).click();
  await expect(ana.getByRole("heading", { name: "You're in, Ana" })).toBeVisible();
  await expect(players.getByText("2/8")).toBeVisible();
});
