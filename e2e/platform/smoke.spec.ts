import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom, trackRelaySockets } from "../src/flows.ts";

test("the host opens a room, two phones join and the room ends on every device", async ({
  host,
  phones,
}) => {
  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  if (!ana || !ben) throw new Error("expected two phones");
  const sockets = [ana, ben].map(trackRelaySockets);

  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");

  const players = host.getByRole("region", { name: "Players" });
  await expect(players.getByText("2/8")).toBeVisible();
  await expect(players.getByText("Ana", { exact: true })).toBeVisible();
  await expect(players.getByText("Ben", { exact: true })).toBeVisible();
  for (const socket of sockets) expect(socket.open()).toBe(1);

  // Ending the room closes every socket with 4004 (room-closed). CC-1.11 saw a phone socket stay
  // open for a few seconds afterwards, so each phone socket must close within 2 seconds of the
  // phone showing that the room closed.
  await host.getByRole("button", { name: "End room" }).click();
  await expect(host.getByText("The room has closed.")).toBeVisible();
  for (const [i, phone] of [ana, ben].entries()) {
    await expect(phone.getByText(`Room ${code} has closed. Join another one.`)).toBeVisible();
    await expect.poll(() => sockets[i]?.open(), { timeout: 2_000 }).toBe(0);
  }
});
