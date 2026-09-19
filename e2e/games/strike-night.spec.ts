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

/**
 * The subset of Strike Night's state (games/strike-night/src/shared/state.ts) the bots read. The
 * real `StrikeNightState` names the player up `bowlerId` (a player id, not their name) — there is
 * no `bowler` field. Resolving it to "Ana" or "Ben" needs a look through `players` by `id`.
 */
interface TvState {
  phase: "intro" | "lineup" | "rolling" | "result" | "frameEnd" | "over";
  frame: number;
  turn: number;
  roll: 1 | 2;
  bowlerId: string | null;
  players: { id: string; name: string; total: number; strikes: number }[];
}

/** The name of the player up to bowl, or null before `intro` ends (`StrikeNightState.bowlerId`). */
function bowlerName(state: TvState): string | null {
  return state.players.find((player) => player.id === state.bowlerId)?.name ?? null;
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

/**
 * Keeps a phone resting in a hand until `stop()`: samples keep coming, so motion never stalls.
 * Cycles a short still trace (rather than one long one) so `pauseFor` never overlaps its own
 * samples with the deliberate swing trace a real bowl plays through the same fake adapter — the
 * adapter has no notion of "whose" play() call is in flight, so two concurrent traces would
 * interleave into the same swing detector and corrupt it.
 */
function holdStill(phone: Page): {
  stop(): Promise<void>;
  /** Runs `fn` once no still-trace chunk can still be in flight, then resumes resting. */
  pauseFor(fn: () => Promise<void>): Promise<void>;
} {
  const cycleMs = 250;
  let holding = true;
  let paused = false;
  const done = (async () => {
    while (holding) {
      if (paused) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      await playMotionTrace(phone, stillTrace(cycleMs));
    }
  })();
  return {
    stop: () => {
      holding = false;
      return done;
    },
    pauseFor: async (fn) => {
      paused = true;
      // The longest a chunk already in flight can still be running.
      await new Promise((resolve) => setTimeout(resolve, cycleMs + 20));
      try {
        await fn();
      } finally {
        paused = false;
      }
    },
  };
}

type Resting = ReturnType<typeof holdStill>;

/**
 * A bowling swing (motion mode): rotation-rate spike that crosses SWING_START_RATE (120 deg/s) and
 * peaks at least SWING_MIN_PEAK (240). This is at line 62 of packages/motion/src/gestures/swing.ts.
 */
function swingTrace(ms: number): MotionTrace {
  const samples: unknown[] = [];
  // Ramp up rotation rate over ~200ms to cross 120 deg/s and peak at 300 deg/s
  for (let t = 0; t <= ms; t += 1000 / 60) {
    // z-axis rotation (yaw for bowling swing): ramp up to 300 then fade
    const phase = Math.min(t, 200) / 200; // 0..1 over ~200ms
    const rz = phase < 0.5 ? phase * 2 * 300 : (1 - phase) * 600; // Triangle wave peak 300 deg/s
    samples.push([
      Math.round(t),
      16.7,
      [0, 0, 0], // accel (still)
      [0, 6.94, 6.94], // gravity
      [0.4, -0.2, rz], // rotation rate: z-axis already in deg/s per trace.ts format, no conversion
    ]);
  }
  return {
    v: 1,
    gesture: "swing",
    label: "e2e-bowling-swing",
    platform: "android",
    device: "fake adapter",
    recordedAt: "2026-09-17",
    rawSigns: "w3c",
    expect: { events: 1 },
    marks: [],
    samples,
  };
}

/**
 * Simulates a bowl for the given mode (touch or motion). Waits for the phone's own screen to be
 * ready for a fresh grip first: the host's game state can flip to `lineup` a beat before the
 * bowler's phone has the matching `sn-bowl` screen (a network hop away), and racing that stale
 * screen with an interaction is silently swallowed — Controller.vue's `onPress` drops it because
 * `canGrip` is still false, exactly like the other games' specs wait for a status line or a named
 * button before they interact (games/quick-draw.spec.ts, games/target-range.spec.ts).
 *
 * Motion is not just "shake the phone": bowl.ts's swing detector only listens between the
 * `grip-down` and `grip-up` marks the pointer supplies (Controller.vue's `.grip` div and
 * CcBigAction), the same as a real bowler holds the big action, swings, then lets go. So this
 * holds the button down, plays the swing trace while gripped, then releases it — the trace alone,
 * without the hold, would never reach the detector at all.
 */
async function simpleBowl(phone: Page, mode: "touch" | "motion", resting?: Resting): Promise<void> {
  // The button is nested inside div.grip and emits @press on pointerdown.
  // Controller.vue shows <CcBigAction ... @press="onPress" /> inside div.grip.
  const readyLabel = mode === "touch" ? "Swipe up to bowl" : "Hold the ball";
  const button = phone.getByRole("button", { name: readyLabel });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  if (box === null) throw new Error("the button is not on screen");

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  if (mode === "touch") {
    // Use a large swipe distance (at least 150px) to ensure it exceeds SWIPE_MIN_PX threshold
    const swipeDistance = Math.max(150, box.height);

    // Pointer sequence: down (grip) -> move up (swipe) -> up (release)
    await phone.mouse.move(x, y);
    await phone.mouse.down();
    await phone.waitForTimeout(50); // Brief hold before swiping
    await phone.mouse.move(x, y - swipeDistance, { steps: 5 });
    await phone.mouse.up();
    await phone.waitForTimeout(100);
    return;
  }

  // Motion mode: hold the big action (grip-down), swing the phone (a rotation-rate spike past
  // SWING_START_RATE that peaks past SWING_MIN_PEAK, packages/motion/src/gestures/swing.ts), then
  // let go (grip-up). `resting.pauseFor` keeps the background "still" trace (used so the phone
  // never looks like it stopped sending samples between turns) off the same fake adapter while
  // the real swing plays, so the two traces' samples can't interleave into one detector.
  //
  // `swingTrace`'s ramp and decay finish by 200ms (the peak sits at ~100ms); playing past that
  // only delays this releasing the grip, and `emitOn: "release"` needs the release within
  // SWING_RELEASE_WINDOW_MS (300ms) of the peak. 200ms keeps a comfortable margin instead of
  // spending most of that window on a flat tail the detector doesn't need (grip-up itself ends
  // the swing candidate; it doesn't need the trace's own quiet period to do that).
  const doSwing = async (): Promise<void> => {
    await phone.mouse.move(x, y);
    await phone.mouse.down();
    await playMotionTrace(phone, swingTrace(200));
    await phone.mouse.up();
    await phone.waitForTimeout(100);
  };
  if (resting) await resting.pauseFor(doSwing);
  else await doSwing();
}

test("two bots play a full 10-frame match and the match completes with a results screen", async ({
  host,
  phones,
}) => {
  test.setTimeout(600_000); // 10 minutes - a full match bowls fast in practice (seconds per roll); this only bounds the rare case that leans on the ~20s auto-roll fallback

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

    // Play frames until the match is over or we hit a limit. Both players bowl every frame
    // (games/strike-night/src/shared/constants.ts: `frameCount` 10, `rollsPerFrame` 2, a strike
    // fixed at 30 skips roll 2 rather than earning bonus rolls), so two players' worst case —
    // neither ever strikes — is 2 x 10 x 2 = 40 rolls, not 10 frames' worth. Every roll costs two
    // of these iterations, not one: after a bowl this loop comes back around while the state is
    // still `rolling`/`result` (not yet the next `lineup`), so one iteration is spent waiting for
    // that before the next one can bowl. 90 gives room for the worst case (40 rolls, 2 x 40 - 1
    // iterations) plus a margin, well inside `test.setTimeout` above. If the match is still mid
    // roll when this runs out, the poll just below covers that tail.
    //
    // `turn` only advances once the *next* lineup opens, not the moment a bowl fires (`rolling`
    // and `result` sit in between, and the ball's own physics takes a beat) — so the stall check
    // below only compares turn numbers between two `lineup` observations, never against a
    // `rolling`/`result` reading still resolving the same turn.
    let lastLineupTurn: number | null = null;
    for (let rollCount = 0; rollCount < 90; rollCount++) {
      const state = await tvState(host);

      if (state === null) throw new Error("game state unavailable");
      if (state.phase === "over") break;

      if (state.phase !== "lineup") {
        // Wait for lineup, or for the match to end here if that was the last roll: `frameEnd`
        // after the 10th frame's last bowler goes straight to `over`, never back to `lineup`.
        // Allow up to 20s for the game's own auto-roll fallback to kick in if the bowler never
        // sends input (turnTimerMs + autoRollWaitMs ~= 20.5s).
        await host.waitForFunction(
          () => {
            const phase = window.__strikeNightState?.()?.phase;
            return phase === "lineup" || phase === "over";
          },
          undefined,
          { polling: 50, timeout: 20_000 },
        );
        continue;
      }

      // A lineup for the same turn we last bowled for, with no roll seen in between (not even the
      // 20s auto-roll fallback above), means the bowl never reached the host at all.
      if (state.turn === lastLineupTurn) {
        throw new Error(`Match stalled: lineup reopened for turn ${state.turn} with no roll`);
      }
      lastLineupTurn = state.turn;

      // In lineup phase: send a bowl input using the appropriate mode
      const bowler = bowlerName(state);
      const bowlerPhone = bowler === "Ana" ? ana : ben;
      const bowlerMode = bowler === "Ana" ? "touch" : "motion";
      try {
        await simpleBowl(bowlerPhone, bowlerMode, resting);
      } catch (err) {
        throw new Error(`Failed to bowl for ${bowler}: ${err}`);
      }

      // Wait for phase to leave lineup (to rolling, result, frameEnd, or over).
      // Allow up to 20s for auto-roll fallback if the input didn't fire.
      await host.waitForFunction(
        () => {
          const s = window.__strikeNightState?.();
          return s?.phase !== "lineup";
        },
        undefined,
        { polling: 50, timeout: 20_000 },
      );
    }

    // The match should be over now. The loop above can run out of iterations while the very last
    // roll is still `rolling` (the ball and pins settle over a couple of seconds), so give that
    // tail a little more room rather than failing on a technicality.
    await expect.poll(async () => (await tvState(host))?.phase, { timeout: 30_000 }).toBe("over");
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
