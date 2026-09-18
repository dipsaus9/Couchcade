import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";

// A phone that drops mid-game comes back as the same player (docs/architecture/session-flow.md,
// "Phone reconnect"). Ben's phone is closed during a Quick Draw match and reopened with the session
// it kept in sessionStorage, the way a locked or reloaded phone keeps it. The relay gives him the
// same seat, so the same colour and shape, the TV hears player:reconnected and re-sends his view,
// and his controller works again.

/** The phone's stored session key (docs/architecture/platform.md, "Tickets and rejoin tokens"). */
const sessionKey = "couchcade:session";

type Frame = { t: string; d: Record<string, unknown> };

/** Records every JSON frame a page receives on its relay socket (`/ws/<code>`). */
function recordRelayFrames(page: Page): Frame[] {
  const frames: Frame[] = [];
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.startsWith("/ws/")) return;
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string" || !payload.startsWith("{")) return;
      frames.push(JSON.parse(payload) as Frame);
    });
  });
  return frames;
}

const ofType = (frames: readonly Frame[], t: string) => frames.filter((frame) => frame.t === t);

/** The player a phone's latest `room:welcome` seated it as. */
function welcomedAs(frames: readonly Frame[]): Record<string, unknown> | undefined {
  return ofType(frames, "room:welcome").at(-1)?.d["you"] as Record<string, unknown> | undefined;
}

test("a phone closed mid-game rejoins with the same seat and gets its controller back", async ({
  host,
  phones,
}) => {
  test.setTimeout(120_000);

  const tvFrames = recordRelayFrames(host);
  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  if (!ana || !ben) throw new Error("expected two phones");
  const benFrames = recordRelayFrames(ben);

  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  // Ben is the second seat: his colour and shape come from it.
  await expect(ben.getByText("Player 2", { exact: true })).toBeVisible();
  await expect(ben.getByText(/^You're \w+, the \w+\. Watch the TV\.$/)).toBeVisible();
  await expect.poll(() => welcomedAs(benFrames)).toMatchObject({ name: "Ben", slot: 1 });
  const seated = welcomedAs(benFrames)!;
  const stored = await ben.evaluate((key) => sessionStorage.getItem(key), sessionKey);
  expect(stored).toContain(String(seated["id"]));

  // Ana, the VIP, starts Quick Draw through the menu.
  await ana.getByRole("button", { name: "Choose a game" }).tap();
  await ana.getByRole("button", { name: "Quick Draw" }).tap();
  for (const phone of [ana, ben]) {
    await expect(phone.getByRole("status")).toHaveText("Round 1 · first to 3", { timeout: 15_000 });
  }

  // Ben's phone goes away mid-game. The TV keeps his seat and the game goes on.
  await ben.context().close();
  await expect
    .poll(() => ofType(tvFrames, "player:left").map((frame) => frame.d))
    .toContainEqual({ id: seated["id"], reason: "disconnected" });

  // He opens the page again with his stored session.
  let againFrames: Frame[] = [];
  const [benAgain] = await phones(1, {
    sessionStorage: { [sessionKey]: stored ?? "" },
    beforeLoad: (page) => {
      againFrames = recordRelayFrames(page);
    },
  });
  if (!benAgain) throw new Error("expected Ben's phone again");

  // Same player: same id, name, seat (so colour and shape) and join time. Pip `profile` is not
  // compared here: the lobby's on-entry reconcile (docs/architecture/pips.md "When the Pip is
  // sent" item 2, CC-6.5) can send a correction moments after `seated` was captured above, so the
  // server's player list -- and this reconnect's room:welcome -- may already reflect a profile
  // `seated` was snapshotted too early to include, even though it is still the very same player.
  await expect
    .poll(() => welcomedAs(againFrames))
    .toMatchObject({
      id: seated["id"],
      name: seated["name"],
      slot: seated["slot"],
      joinedAt: seated["joinedAt"],
      connected: seated["connected"],
    });
  await expect
    .poll(() => ofType(tvFrames, "player:reconnected").map((frame) => frame.d))
    .toContainEqual({ id: seated["id"] });
  const benJoins = ofType(tvFrames, "player:joined").filter(
    (frame) => (frame.d["player"] as { id: string }).id === seated["id"],
  );
  expect(benJoins).toHaveLength(1);

  // The TV re-sends his view: the Quick Draw controller is back, and his tap counts as Ben's.
  await benAgain.getByRole("button", { name: "Wait for DRAW" }).tap({ timeout: 20_000 });
  await expect(benAgain.getByRole("status")).toHaveText(
    /^(You won the round!|Too early, that's a foul|That was a fake, that's a foul)$/,
    { timeout: 20_000 },
  );
});
