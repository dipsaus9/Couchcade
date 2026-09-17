import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import { playMotionTrace, type MotionTrace } from "../src/motion.ts";

// The motion step before a motion game (docs/architecture/motion.md, "Permission, calibration and
// resume flow"). Playwright can't emulate sensors, so each phone gets the fake sensor adapter
// through the `window.__couchcadeMotion` hook (e2e/README.md, "Motion sensors"): one phone's
// browser grants motion, the other's denies it.
//
// No motion game is registered yet, so the test makes one: it wraps the TV's game registry
// through the Vite dev build, the way games/quick-draw.spec.ts wraps the stage, so Quick Draw
// reports `needsMotion: true` on this TV only. Nothing in the apps or games changes, and phones
// still load the real Quick Draw controller once the step is over.

/** Makes Quick Draw need motion on this TV, for this test only. */
async function makeQuickDrawNeedMotion(host: Page): Promise<void> {
  await host.evaluate(async () => {
    type Game = { id: string; needsMotion: boolean };
    const url = "/host/src/runtime/games.ts";
    const { registry } = (await import(/* @vite-ignore */ url)) as {
      registry: { games: Game[]; get(id: string): Game | undefined };
    };
    const withMotion = (game: Game): Game =>
      game.id === "quick-draw" ? { ...game, needsMotion: true } : game;
    const get = registry.get.bind(registry);
    registry.games = registry.games.map(withMotion);
    registry.get = (id) => {
      const game = get(id);
      return game === undefined ? undefined : withMotion(game);
    };
  });
}

/**
 * Hides the page and shows it again, as a screen that went to sleep and woke up. Playwright can't
 * lock a screen, so this sets `visibilityState` and fires `visibilitychange` the way the browser
 * would.
 */
async function sleepAndWake(phone: Page): Promise<void> {
  await phone.evaluate(() => {
    for (const state of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
}

/**
 * A phone resting in a hand for `ms`, 60 samples a second, in the version 1 trace format: gravity
 * along the screen's y and z axes and a tiny gyroscope bias.
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

test("a phone that grants motion calibrates, a phone that denies it plays with touch, the TV marks it, and a woken phone taps to resume", async ({
  host,
  phones,
  browserName,
}) => {
  test.setTimeout(120_000);

  const code = await openRoom(host);
  const [ana] = await phones(1, { motion: { permission: "granted" } });
  const [ben] = await phones(1, { motion: { permission: "denied" } });
  if (!ana || !ben) throw new Error("expected two phones");
  // Ana joins first, so she is the VIP.
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await expect(host.getByRole("region", { name: "Players" }).getByText("2/8")).toBeVisible();
  await makeQuickDrawNeedMotion(host);

  // Ana picks Quick Draw, which now needs motion. The countdown ends in the motion step.
  await ana.getByRole("button", { name: "Choose a game" }).tap();
  const quickDraw = ana.getByRole("button", { name: "Quick Draw" });
  await expect(quickDraw).toContainText("Motion");
  await quickDraw.tap();

  const tvStep = host.getByRole("region", { name: "Motion step" });
  await expect(tvStep.getByRole("heading", { name: "Quick Draw" })).toBeVisible();
  const chip = (name: string) => tvStep.getByRole("listitem").filter({ hasText: name });
  const touchIcon = (name: string) => chip(name).getByRole("img", { name: "Touch controls" });

  for (const phone of [ana, ben]) {
    await expect(phone.getByRole("heading", { name: "Quick Draw uses motion" })).toBeVisible();
    await expect(phone.getByRole("button", { name: "Tap to enable motion" })).toBeVisible();
    await expect(phone.getByRole("button", { name: "Use touch instead" })).toBeVisible();
    // iPhones get the Portrait Orientation Lock hint; the WebKit project emulates an iPhone 15 and
    // the Chromium one a Pixel 7.
    await expect(phone.getByText("Tip: turn on Portrait Orientation Lock")).toHaveCount(
      browserName === "webkit" ? 1 : 0,
    );
  }
  await expect(chip("Ana")).toContainText("Deciding");
  await expect(chip("Ben")).toContainText("Deciding");

  // Denied: Ben's browser says no. His phone switches to touch and the TV marks him with the touch
  // icon, while the game waits for Ana.
  await ben.getByRole("button", { name: "Tap to enable motion" }).tap();
  await expect(ben.getByRole("heading", { name: "Touch controls it is" })).toBeVisible();
  await expect(ben.getByText("Want motion? Allow it when the next game asks.")).toBeVisible();
  await expect(touchIcon("Ben")).toBeVisible();
  await expect(touchIcon("Ana")).toHaveCount(0);
  await expect(tvStep.getByText("Waiting for 1 phone")).toBeVisible();
  await ben.getByRole("button", { name: "Ready" }).tap();
  await expect(ben.getByRole("heading", { name: "Watch the TV" })).toBeVisible();

  // Granted: Ana's phone rests in her hand while she taps. After a second of holding still it is
  // calibrated, tells the TV, and the game starts for both. The samples keep coming while the game
  // runs, so her sensors don't count as stopped.
  const resting = playMotionTrace(ana, stillTrace(9000));
  await ana.getByRole("button", { name: "Tap to enable motion" }).tap();
  await expect(ana.getByRole("heading", { name: "Hold your phone still" })).toBeVisible();
  await expect(tvStep).toHaveCount(0, { timeout: 15_000 });
  for (const phone of [ana, ben]) {
    await expect(phone.getByRole("status")).toHaveText("Round 1 · first to 3", {
      timeout: 15_000,
    });
  }

  // Ana's screen sleeps and wakes during the game: "Tap to resume" covers her controller until she
  // taps, which switches motion back on.
  await sleepAndWake(ana);
  const resume = ana.getByRole("dialog", { name: "Tap to resume" });
  await expect(resume.getByRole("heading", { name: "Welcome back, Ana" })).toBeVisible();
  await resume.getByRole("button", { name: "Tap to resume" }).tap();
  await expect(resume).toHaveCount(0);
  await resting;
});
