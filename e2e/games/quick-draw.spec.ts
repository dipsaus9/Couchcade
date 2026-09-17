import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import { playRound, tvState, watchTv } from "../src/quick-draw.ts";

// Bots play a whole Quick Draw match (docs/games/quick-draw.md): one TV, two phones, first to 3.
//
// The match starts the way people start it: the VIP taps "Choose a game", then Quick Draw, and the
// TV counts down from 3 (docs/architecture/session-flow.md, "Game menu").
//
// One gap in the apps is bridged here, in the test only: the bots watch the TV's game state to see
// DRAW! (src/quick-draw.ts).

test("two bots play a full match and the faster one wins", async ({ host, phones }) => {
  test.setTimeout(150_000);

  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  if (!ana || !ben) throw new Error("expected two phones");

  // Ana joins first, so she is the VIP.
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await expect(host.getByRole("region", { name: "Players" }).getByText("2/8")).toBeVisible();

  await watchTv(host);

  // Ana opens the game menu on her phone. The TV shows it, and Ben waits for her pick.
  await ana.getByRole("button", { name: "Choose a game" }).tap();
  const tvMenu = host.getByRole("region", { name: "Game menu" });
  await expect(tvMenu.getByText("Quick Draw", { exact: true })).toBeVisible();
  await expect(ben.getByText("Ana is choosing a game.")).toBeVisible();

  // Ana picks Quick Draw. The TV counts down from 3, then the game starts and both phones load
  // its controller.
  await ana.getByRole("button", { name: "Quick Draw" }).tap();
  await expect(tvMenu.getByText("Starting in")).toBeVisible();
  await expect.poll(async () => (await tvState(host))?.round).toBe(1);
  for (const phone of [ana, ben]) {
    await expect(phone.getByRole("status")).toHaveText("Round 1 · first to 3");
  }

  for (let round = 1; round <= 3; round++) {
    await playRound(host, ana, ben, round);
    await expect(ana.getByRole("status")).toHaveText("You won the round!");
    await expect(ben.getByRole("status")).toHaveText(/^(Ana was faster|Too slow this time)$/);
    await expect(ana.getByText(`${round} ${round === 1 ? "point" : "points"}`)).toBeVisible();
  }

  // The match ends after round 3's result: Ana has 3 points and the results screen shows her win.
  await expect.poll(async () => (await tvState(host))?.phase, { timeout: 10_000 }).toBe("over");
  const final = await tvState(host);
  expect(final?.round).toBe(3);
  expect(final?.players.map(({ name, points }) => ({ name, points }))).toEqual([
    { name: "Ana", points: 3 },
    { name: "Ben", points: 0 },
  ]);

  // The TV shows the final standings. Only Ana, the VIP, gets "Play again" and "Back to menu"; Ben
  // just sees his placement (docs/architecture/session-flow.md, "Results").
  const tvResults = host.getByRole("region", { name: "Results" });
  await expect(tvResults.getByRole("heading", { name: "Ana wins!" })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Play again" })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Back to menu" })).toBeVisible();
  await expect(ben.getByText("2nd")).toBeVisible();
  await expect(ben.getByRole("button", { name: "Play again" })).toHaveCount(0);
});
