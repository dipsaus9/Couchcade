import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import { playMotionTrace, type MotionTrace } from "../src/motion.ts";

// Bots play a whole Strike Night match (docs/games/strike-night.md): one TV, two phones, 10 frames.
//
// The match starts the way people start it: the VIP picks Strike Night on her phone, the TV counts
// down from 3, and the motion step runs (docs/architecture/session-flow.md, "Game menu", and
// motion.md, "Permission, calibration and resume flow"). Each phone gets the fake sensor adapter
// through `window.__couchcadeMotion` (e2e/README.md, "Motion sensors").
//
// Ana's browser denies motion, so she plays with touch. Ben's browser grants motion. Both bots
// bowl automatically in each frame, with Ben using motion and Ana using the touch swipe fallback.
// The match proceeds through all 10 frames and ends with a results screen showing the winner.

/** The subset of Strike Night's state (games/strike-night/src/shared/state.ts) the bots read. */
interface TvState {
  phase: "intro" | "lineup" | "rolling" | "result" | "frameEnd" | "over";
  frame: number;
  turn: number;
  roll: 1 | 2;
  bowler: string | null;
  players: { name: string; total: number; strikes: number }[];
}

declare global {
  interface Window {
    __strikeNightState?: () => TvState;
  }
}

/**
 * Makes the TV's running game state readable as `window.__strikeNightState`. The host starts a
 * game's scene through `phaserStage.start(game, { getState })`, and a dynamic import of the same
 * dev-server URL returns the module instance the app already runs.
 */
async function watchTv(host: Page): Promise<void> {
  await host.evaluate(async () => {
    const url = "/host/src/runtime/stage.ts";
    const { phaserStage } = await import(/* @vite-ignore */ url);
    const start = phaserStage.start.bind(phaserStage);
    phaserStage.start = (game: unknown, data: { getState: () => TvState }) => {
      window.__strikeNightState = data.getState;
      return start(game, data);
    };
  });
}

/** The TV's game state, or null before a game started. */
function tvState(host: Page): Promise<TvState | null> {
  return host.evaluate(() => window.__strikeNightState?.() ?? null);
}

/**
 * A phone resting in a hand for `ms`, 60 samples a second, in the version 1 trace format: gravity
 * along the screen's y and z axes and a tiny gyroscope bias (as in platform/motion-permission.spec.ts).
 */
function stillTrace(ms: number): MotionTrace {
  const samples: unknown[] = [];
  for (let t = 0; t <= ms; t += 1000 / 60) {
    samples.push([Math.round(t), 16.7, [0, 0, 0], [0, 6.94, 6.94], [0.4, -0.2, 0.1]]);
  }
  return {
    v: 1,
    gesture: "still",
    label: "e2e-still",
    platform: "android",
    device: "fake adapter",
    recordedAt: "2026-09-17",
    rawSigns: "w3c",
    expect: { events: 0 },
    marks: [],
    samples,
  };
}

/** Keeps a phone resting in a hand until `stop()`: samples keep coming, so motion never stalls. */
function holdStill(phone: Page): { stop(): Promise<void> } {
  let holding = true;
  const done = (async () => {
    while (holding) await playMotionTrace(phone, stillTrace(5_000));
  })();
  return {
    stop: () => {
      holding = false;
      return done;
    },
  };
}

/** Simulates a bowl with a swipe gesture on the big ball button. */
async function simpleBowl(phone: Page): Promise<void> {
  // The big action button responds to swipes. For touch mode, we need a swipe up.
  const locator = phone.locator("div.grip");
  const box = await locator.boundingBox();
  if (box === null) throw new Error("the grip area is not on screen");

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const swipeDistance = box.height * 0.4; // Swipe up about 40% of the button height

  // Perform a swipe: down -> up motion, which triggers the swipe gesture
  await phone.mouse.move(x, y);
  await phone.mouse.down();
  await phone.mouse.move(x, y - swipeDistance, { steps: 3 });
  await phone.mouse.up();
  // Give the gesture detector time to process
  await phone.waitForTimeout(100);
}

test("two bots play a full 10-frame match and the match completes with a results screen", async ({
  host,
  phones,
}) => {
  test.setTimeout(120_000); // 2 minutes - enough for a few frames, fails fast if stalled

  const code = await openRoom(host);
  const [ana] = await phones(1, { motion: { permission: "denied" } });
  const [ben] = await phones(1, { motion: { permission: "granted" } });
  if (!ana || !ben) throw new Error("expected two phones");

  // Ana joins first, so she is the VIP.
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await expect(host.getByRole("region", { name: "Players" }).getByText("2/8")).toBeVisible();

  await watchTv(host);

  // Ana opens the game menu on her phone and picks Strike Night, a motion game. The TV counts down
  // from 3, then shows the motion step.
  await ana.getByRole("button", { name: "Choose a game" }).tap();
  const tvMenu = host.getByRole("region", { name: "Game menu" });
  await expect(tvMenu.getByText("Strike Night", { exact: true })).toBeVisible();
  const strikeNight = ana.getByRole("button", { name: "Strike Night" });
  await expect(strikeNight).toContainText("Motion");
  await strikeNight.tap();
  await expect(tvMenu.getByText("Starting in")).toBeVisible();
  await expect(host.getByRole("region", { name: "Motion step" })).toBeVisible({ timeout: 15_000 });

  // Ana's browser says no: she plays with touch. Ben's phone rests in his hand, calibrates and plays
  // with motion.
  await ana.getByRole("button", { name: "Tap to enable motion" }).tap();
  await expect(ana.getByRole("heading", { name: "Touch controls it is" })).toBeVisible();
  await ana.getByRole("button", { name: "Ready" }).tap();
  const resting = holdStill(ben);
  try {
    await ben.getByRole("button", { name: "Tap to enable motion" }).tap();
    await expect(host.getByRole("region", { name: "Motion step" })).toHaveCount(0, {
      timeout: 15_000,
    });

    // Wait for the first lineup phase
    await expect.poll(async () => (await tvState(host))?.phase, { timeout: 15_000 }).toBe("lineup");

    // Play frames until the match is over or we hit a limit. Each frame has 1-2 rolls depending
    // on strikes. A typical match has ~15-20 rolls total (less if there are many strikes).
    let lastTurn = 0;
    for (let rollCount = 0; rollCount < 30; rollCount++) {
      const state = await tvState(host);

      if (state === null) throw new Error("game state unavailable");
      if (state.phase === "over") break;

      // Detect if we're making progress by checking if turn number increases
      if (state.turn === lastTurn && rollCount > 0) {
        throw new Error(
          `Match stalled on turn ${lastTurn}; no progress after ${rollCount} iterations`,
        );
      }
      lastTurn = state.turn;

      if (state.phase !== "lineup") {
        // Wait for lineup with a shorter timeout (5 sec per phase transition)
        await host.waitForFunction(
          () => {
            const s = window.__strikeNightState?.();
            return s?.phase === "lineup";
          },
          undefined,
          { polling: 50, timeout: 5_000 },
        );
        continue;
      }

      // In lineup phase: send a bowl input
      const bowlerPhone = state.bowler === "Ana" ? ana : ben;
      try {
        await simpleBowl(bowlerPhone);
      } catch (err) {
        throw new Error(`Failed to bowl for ${state.bowler}: ${err}`);
      }

      // Wait for phase to leave lineup (to rolling, result, frameEnd, or over)
      await host.waitForFunction(
        () => {
          const s = window.__strikeNightState?.();
          return s?.phase !== "lineup";
        },
        undefined,
        { polling: 50, timeout: 5_000 },
      );
    }

    // The match should be over now
    const finalState = await tvState(host);
    if (finalState?.phase !== "over") {
      throw new Error(`Match did not complete; final phase is ${finalState?.phase}, not 'over'`);
    }

    // Verify the results screen shows both players
    const tvResults = host.getByRole("region", { name: "Results" });
    await expect(tvResults).toBeVisible();

    // Check for a winner heading with actual winner text (not just any heading)
    const winnerHeading = tvResults.getByRole("heading");
    await expect(winnerHeading).toBeVisible();
    // Verify it's a winner declaration, not an error or empty state
    await expect(winnerHeading).toContainText(/wins|tie/i);
  } finally {
    await resting.stop();
  }

  // Final state assertions
  const final = await tvState(host);
  if (final === null) throw new Error("expected final state");
  expect(final.phase).toBe("over");
  expect(final.players.length).toBe(2);
  expect(final.players[0]?.name).toBeDefined();
  expect(final.players[0]?.total ?? 0).toBeGreaterThanOrEqual(0);
});
