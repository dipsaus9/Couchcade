import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import { playRound, tvState, watchTv } from "../src/quick-draw.ts";

// A refreshed TV doesn't end the night (docs/architecture/session-flow.md, "Host refresh and deploy
// recovery"). The TV sends a round snapshot when a round ends, the relay stores it, and a TV tab that
// reloads rejoins with its stored session, gets the snapshot back and resumes the game at the start
// of the next round with the scores kept. A TV that reloads on the game menu comes back to the menu.

type Frame = { t: string; d: Record<string, unknown> };

/** Every JSON frame a page sends and receives on its relay sockets (`/ws/<code>`), across reloads. */
function recordRelayFrames(page: Page): { sent: Frame[]; received: Frame[] } {
  const frames = { sent: [] as Frame[], received: [] as Frame[] };
  const parse = (payload: string | Buffer): Frame | null =>
    typeof payload === "string" && payload.startsWith("{") ? (JSON.parse(payload) as Frame) : null;
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.startsWith("/ws/")) return;
    socket.on("framesent", ({ payload }) => {
      const frame = parse(payload);
      if (frame) frames.sent.push(frame);
    });
    socket.on("framereceived", ({ payload }) => {
      const frame = parse(payload);
      if (frame) frames.received.push(frame);
    });
  });
  return frames;
}

const ofType = (frames: readonly Frame[], t: string) => frames.filter((frame) => frame.t === t);

/** The `room:snapshot` payloads in `frames`. */
const snapshots = (frames: readonly Frame[]) =>
  ofType(frames, "room:snapshot").map(
    (frame) => frame.d as { round: number; gameId: string | null; data: { g: unknown } | null },
  );

/** Reloads the TV tab, the way someone presses F5 on the laptop. `sessionStorage` survives. */
async function reloadTv(host: Page): Promise<void> {
  await host.reload();
}

test("a TV reloaded mid-game rejoins and resumes Quick Draw at the next round with the scores kept", async ({
  host,
  phones,
}) => {
  test.setTimeout(150_000);

  const tv = recordRelayFrames(host);
  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  if (!ana || !ben) throw new Error("expected two phones");
  const benFrames = recordRelayFrames(ben);

  // Ana joins first, so she is the VIP, and starts Quick Draw through the menu.
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await watchTv(host);
  await ana.getByRole("button", { name: "Choose a game" }).tap();
  await ana.getByRole("button", { name: "Quick Draw" }).tap();
  for (const phone of [ana, ben]) {
    await expect(phone.getByRole("status")).toHaveText("Round 1 · first to 3", { timeout: 15_000 });
  }

  // Round 1: Ana is faster. The TV sent round 0 when the game started, and one snapshot for the end
  // of round 1, which describes the start of round 2.
  await playRound(host, ana, ben, 1);
  await expect(ana.getByRole("status")).toHaveText("You won the round!");
  await expect(ana.getByText("1 point", { exact: false })).toBeVisible();
  await expect
    .poll(() => snapshots(tv.sent).map((snapshot) => snapshot.round), { timeout: 15_000 })
    .toEqual([0, 1]);
  expect(snapshots(tv.sent)[1]).toMatchObject({ gameId: "quick-draw", data: { g: { round: 2 } } });
  const beforeReload = { sent: tv.sent.length, received: tv.received.length };

  // The TV tab reloads.
  await reloadTv(host);
  await watchTv(host);

  // It rejoins its room without the passcode: the relay welcomes it in `playing` and hands back the
  // round 1 snapshot. Phones heard the TV go away and come back.
  const received = () => tv.received.slice(beforeReload.received);
  const sent = () => tv.sent.slice(beforeReload.sent);
  await expect
    .poll(() => ofType(received(), "room:welcome").map((frame) => frame.d["phase"]))
    .toEqual(["playing"]);
  await expect.poll(() => snapshots(received()).map((snapshot) => snapshot.round)).toEqual([1]);
  await expect(host.getByLabel("Host passcode")).toHaveCount(0);
  await expect
    .poll(() => ofType(benFrames.received, "room:host").map((frame) => frame.d["connected"]))
    .toEqual([true, false, true]);

  // Play resumes at the start of round 2 with Ana's point kept.
  for (const phone of [ana, ben]) {
    await expect(phone.getByRole("status")).toHaveText("Round 2 · first to 3", { timeout: 15_000 });
  }
  await expect.poll(async () => (await tvState(host))?.round, { timeout: 15_000 }).toBe(2);
  expect((await tvState(host))?.players.map(({ name, points }) => ({ name, points }))).toEqual([
    { name: "Ana", points: 1 },
    { name: "Ben", points: 0 },
  ]);
  // The relay was already in `playing`, so the TV sent no phase change and kept the stored snapshot.
  expect(ofType(sent(), "room:phase")).toEqual([]);
  expect(snapshots(sent())).toEqual([]);

  // Round 2 plays as usual and counts on from the kept score.
  await playRound(host, ana, ben, 2);
  await expect(ana.getByRole("status")).toHaveText("You won the round!");
  await expect(ana.getByText("2 points", { exact: false })).toBeVisible();
  await expect
    .poll(() => snapshots(sent()).map((snapshot) => snapshot.round), { timeout: 15_000 })
    .toEqual([2]);
  expect(snapshots(sent())[0]).toMatchObject({ data: { g: { round: 3 } } });
});

test("a TV reloaded on the game menu comes back to the menu", async ({ host, phones }) => {
  test.setTimeout(90_000);

  const tv = recordRelayFrames(host);
  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  if (!ana || !ben) throw new Error("expected two phones");
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");

  await ana.getByRole("button", { name: "Choose a game" }).tap();
  const tvMenu = host.getByRole("region", { name: "Game menu" });
  await expect(tvMenu.getByText("Quick Draw", { exact: true })).toBeVisible();
  const beforeReload = tv.sent.length;

  await reloadTv(host);

  // The TV shows the menu again, and the relay stays in `menu`.
  await expect(tvMenu.getByText("Quick Draw", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(host.getByRole("region", { name: "Players" })).toHaveCount(0);
  const sent = () => tv.sent.slice(beforeReload);
  expect(ofType(sent(), "room:phase")).toEqual([]);

  // The VIP still picks on her phone, and the game starts.
  await expect(ben.getByText("Ana is choosing a game.")).toBeVisible();
  await ana.getByRole("button", { name: "Quick Draw" }).tap();
  await expect(tvMenu.getByText("Starting in")).toBeVisible();
  for (const phone of [ana, ben]) {
    await expect(phone.getByRole("status")).toHaveText("Round 1 · first to 3", { timeout: 15_000 });
  }
});
