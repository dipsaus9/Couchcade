import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import { playSoloRound, tvState, watchTv } from "../src/quick-draw.ts";

// One bot plays Quick Draw alone as solo practice (docs/games/quick-draw.md, "Solo practice"): no
// opponent, every valid tap scores, and the match ends after 3 points with the best and average
// time on the phone. As in quick-draw.spec.ts, the bot watches the TV's game state to see DRAW!.

test("one phone plays a full solo practice match", async ({ host, phones }) => {
  test.setTimeout(120_000);

  const code = await openRoom(host);
  const [ana] = await phones(1);
  if (!ana) throw new Error("expected one phone");
  await joinRoom(ana, code, "Ana");
  await expect(host.getByRole("region", { name: "Players" }).getByText("1/8")).toBeVisible();

  await watchTv(host);

  // Ana is the VIP and the only player. Quick Draw fits one player, so she can start it.
  await ana.getByRole("button", { name: "Choose a game" }).tap();
  await ana.getByRole("button", { name: "Quick Draw" }).tap();
  await expect.poll(async () => (await tvState(host))?.round).toBe(1);
  await expect(ana.getByRole("status")).toHaveText("Round 1 · first to 3");

  // Round 1's time is always a new best. Later rounds either beat it or say what the best is.
  await playSoloRound(host, ana, 1);
  await expect(ana.getByRole("status")).toHaveText("New best!");
  await expect(ana.getByText("1 point")).toBeVisible();

  await playSoloRound(host, ana, 2);
  await expect(ana.getByRole("status")).toHaveText(/^(New best!|Your best is 0\.\d{3} s)$/);
  await expect(ana.getByText("2 points")).toBeVisible();

  // The third point ends the match: the last result shows the best and average times.
  await playSoloRound(host, ana, 3);
  await expect(ana.getByText(/^Best 0\.\d{3} s · average 0\.\d{3} s$/)).toBeVisible();

  await expect.poll(async () => (await tvState(host))?.phase, { timeout: 10_000 }).toBe("over");
  const final = await tvState(host);
  expect(final?.players.map(({ name, points }) => ({ name, points }))).toEqual([
    { name: "Ana", points: 3 },
  ]);

  // The platform results screen follows, and Ana can play again on her own.
  await expect(host.getByRole("region", { name: "Results" })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Play again" })).toBeVisible();
});
