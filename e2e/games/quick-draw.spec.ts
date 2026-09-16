import type { Page, WebSocketRoute } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";

// Bots play a whole Quick Draw match (docs/games/quick-draw.md): one TV, two phones, first to 3.
//
// Two gaps in the apps are bridged here, in the test only:
// - Phones have no Start button yet (CC-3.2 and CC-4.8 add the game menu). The VIP's own relay
//   socket carries `ui:action start` instead, through the real relay and host runtime.
// - The phone never shows DRAW!, only the TV does. The bots watch the TV's game state: the spec
//   wraps the host's stage in the Vite dev build to read the running game's state.

/** How long each bot takes to react once the TV shows DRAW!. Valid taps land 100 to 1,500 ms in. */
const reactionMs = { fast: 250, slow: 900 };

/** The subset of Quick Draw's state (games/quick-draw/src/shared/state.ts) the bots read. */
interface TvState {
  phase: "intro" | "standoff" | "draw" | "result" | "over";
  round: number;
  players: { name: string; points: number }[];
}

declare global {
  interface Window {
    __quickDrawState?: () => TvState;
  }
}

/**
 * Makes the TV's running game state readable as `window.__quickDrawState`. The host starts a
 * game's scene through `phaserStage.start(game, { getState })`, and a dynamic import of the same
 * dev-server URL returns the module instance the app already runs.
 */
async function watchTv(host: Page): Promise<void> {
  await host.evaluate(async () => {
    const url = "/host/src/runtime/stage.ts";
    const { phaserStage } = await import(/* @vite-ignore */ url);
    const start = phaserStage.start.bind(phaserStage);
    phaserStage.start = (game: unknown, data: { getState: () => TvState }) => {
      window.__quickDrawState = data.getState;
      return start(game, data);
    };
  });
}

/** The TV's game state, or null before a game started. */
function tvState(host: Page): Promise<TvState | null> {
  return host.evaluate(() => window.__quickDrawState?.() ?? null);
}

/** Keeps the phone's latest relay socket, so the test can send on it as that phone. */
async function captureRelaySocket(phone: Page): Promise<() => WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await phone.routeWebSocket(/\/ws\//, (socket) => {
    server = socket.connectToServer();
  });
  // The route only covers pages loaded after it was added, and the phone is already open.
  await phone.reload();
  return () => {
    if (!server) throw new Error("the phone has no relay socket");
    return server;
  };
}

/** Waits for DRAW! on the TV, then taps the fast bot first and the slow bot later. */
async function playRound(host: Page, fast: Page, slow: Page, round: number): Promise<void> {
  // Fakes happen during `standoff` and never move the game to `draw`, so the bots never tap one.
  await host.waitForFunction(
    (expected) => {
      const state = window.__quickDrawState?.();
      return state?.round === expected && state.phase === "draw";
    },
    round,
    { polling: "raf", timeout: 20_000 },
  );
  const drawSeen = Date.now();
  const tapAfter = async (phone: Page, delayMs: number) => {
    await phone.waitForTimeout(Math.max(0, drawSeen + delayMs - Date.now()));
    await phone.getByRole("button", { name: "Wait for DRAW" }).tap();
  };
  await Promise.all([tapAfter(fast, reactionMs.fast), tapAfter(slow, reactionMs.slow)]);
}

test("two bots play a full match and the faster one wins", async ({ host, phones }) => {
  test.setTimeout(150_000);

  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  if (!ana || !ben) throw new Error("expected two phones");
  const vipSocket = await captureRelaySocket(ana);

  // Ana joins first, so she is the VIP.
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await expect(host.getByRole("region", { name: "Players" }).getByText("2/8")).toBeVisible();

  await watchTv(host);
  vipSocket().send(JSON.stringify({ t: "ui:action", d: { action: "start" } }));

  // The host registry picked Quick Draw, and both phones load its controller.
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

  // The match ends after round 3's result: Ana has 3 points and everyone is back in the lobby.
  await expect.poll(async () => (await tvState(host))?.phase, { timeout: 10_000 }).toBe("over");
  const final = await tvState(host);
  expect(final?.round).toBe(3);
  expect(final?.players.map(({ name, points }) => ({ name, points }))).toEqual([
    { name: "Ana", points: 3 },
    { name: "Ben", points: 0 },
  ]);
  await expect(host.getByRole("region", { name: "Players" })).toBeVisible();
  for (const [phone, name] of [
    [ana, "Ana"],
    [ben, "Ben"],
  ] as const) {
    await expect(phone.getByRole("heading", { name: `You're in, ${name}` })).toBeVisible();
  }
});
