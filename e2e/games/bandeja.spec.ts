import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import { playMotionTrace, type MotionTrace } from "../src/motion.ts";

// A bot plays a whole Bandeja match (docs/games/bandeja.md): one TV, two phones, singles (2
// players), first side to 7 points.
//
// The match starts the way people start it: the VIP picks Bandeja on her phone, the TV counts down
// from 3, and the motion step runs (docs/architecture/session-flow.md, "Game menu", and motion.md,
// "Permission, calibration and resume flow"). Each phone gets the fake sensor adapter through
// `window.__couchcadeMotion` (e2e/README.md, "Motion sensors").
//
// Ana's browser denies motion, so she plays with touch, and she is the whole test's bot: every time
// the ball becomes reachable at her slot (`a-solo`), she taps the pad's left half the instant the
// true arrival moment passes, read straight off the host's own running state (rules.ts grades a
// swing against `ctx.atMs - ctx.displayLagMs`, and a fresh E2E room never runs the CC-3.8 TV-lag
// calibration, so `displayLagMs` is always 0 -- the state's own arrival moment is exactly what a
// swing is judged against). A tap always emits a full `angle: -60` aim (docs/games/bandeja.md,
// "Aim, forehand and backhand"): "over a clean drive's 11.8 m of flight, full aim moves the ball
// 4.8 m sideways, half the width of the court, which is enough to place it past a defender". A
// singles slot's reach is only 3.6 m, so every ball Ana actually connects with sails straight past
// whoever's on the other side and double-bounces there unreturned.
//
// Ben's browser grants motion, and his phone just rests in his hand the whole match: he never
// swings at all. His side loses every rally it's on, whether that's Ben himself failing to
// return (his `missStreak` climbs, and after 3 misses rule 10's auto-return takes his slot for the
// rest of the match) or, once auto-returning, the CC-23.8 CPU dutifully hitting the ball back to
// Ana dead centre -- which she then puts away with the same full-aim tap. Either way Ana wins every
// point, so the match reaches 7-0 (or close to it) in a small, bounded number of points: a
// deterministic result that exercises real rallies, a real net/double-bounce point end, and the
// rule 10 auto-return fallback, without needing to out-aim a moving target.

/** The subset of Bandeja's state (games/bandeja/src/shared/state.ts) the bot reads. */
interface TvState {
  phase: "intro" | "serve" | "rally" | "pointEnd" | "over";
  nowMs: number;
  scores: { a: number; b: number };
  ball: { leg: { arrivals: Partial<Record<string, number>> } } | null;
}

declare global {
  interface Window {
    __bandejaState?: () => { now: TvState };
  }
}

/**
 * Makes the TV's running game state readable as `window.__bandejaState`. The host starts a game's
 * scene through `phaserStage.start(game, { getState })`, and a dynamic import of the same
 * dev-server URL returns the module instance the app already runs. `index.ts` wraps Bandeja's rules
 * in `withRewind` (CC-3.7), so `getState()` returns the wrapper; `games/bandeja/src/host/scene.ts`
 * reads its current state off `.now`, and so does this hook.
 */
async function watchTv(host: Page): Promise<void> {
  await host.evaluate(async () => {
    const url = "/host/src/runtime/stage.ts";
    const { phaserStage } = await import(/* @vite-ignore */ url);
    const start = phaserStage.start.bind(phaserStage);
    phaserStage.start = (game: unknown, data: { getState: () => { now: TvState } }) => {
      window.__bandejaState = data.getState;
      return start(game, data);
    };
  });
}

/** The TV's game state, or null before a game started. */
function tvState(host: Page): Promise<TvState | null> {
  return host.evaluate(() => window.__bandejaState?.().now ?? null);
}

/**
 * A phone resting in a hand for `ms`, 60 samples a second, in the version 1 trace format: gravity
 * along the screen's y and z axes and a tiny gyroscope bias (as in games/strike-night.spec.ts and
 * platform/motion-permission.spec.ts).
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
    recordedAt: "2026-09-23",
    rawSigns: "w3c",
    expect: { events: 0 },
    marks: [],
    samples,
  };
}

/** Keeps a phone resting in a hand until `stop()`: samples keep coming, so motion never stalls, and
 * no swing ever crosses the detector's threshold -- Ben genuinely never plays a shot. */
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

/**
 * Schedules one tap on the pad's left half (a full, deterministic -60 deg aim) to land `delayMs`
 * from now, timed inside the phone's own page rather than round-tripped through Node: a `setTimeout`
 * in the browser lands far closer to the mark than polling Node and firing a Playwright input each
 * time would, which matters because Bandeja grades a swing's timing to the millisecond (rules.ts:
 * `error = actedMs - arriveAt`, "clean" within 60 ms, "ok" within 140, "mishit" within 240). The
 * dispatched `PointerEvent`'s own `timeStamp` becomes the swing's `peakAt`
 * (`packages/motion/src/fallbacks/swing.ts`'s `createSwingTap`), so what matters is when this
 * callback actually runs, not when Node asked the page to schedule it. `usePress`
 * (`packages/ui/src/components/press.ts`) already expects a synthetic pointer event: it catches the
 * `setPointerCapture` call a real pointer would satisfy and counts the press anyway.
 */
async function scheduleTap(button: Locator, delayMs: number): Promise<void> {
  await button.evaluate((el, delay) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width * 0.25; // the left half of the pad
        const y = rect.top + rect.height / 2;
        const init: PointerEventInit = {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: y,
        };
        el.dispatchEvent(new PointerEvent("pointerdown", init));
        el.dispatchEvent(new PointerEvent("pointerup", init));
        resolve();
      }, delay);
    });
  }, delayMs);
}

/**
 * Ana's whole strategy: watch the host's own state for an arrival at `a-solo`, and schedule a tap to
 * land right on it. Runs until the match is over and returns the final state. The iteration cap
 * bounds a genuinely stuck match (a bug) with a clear failure instead of hanging past the test's own
 * timeout: at a 20 ms poll and a 6-minute match cap (`matchMaxMs`) plus the 6 s match-end pause,
 * about 18,500 iterations comfortably covers the whole clock even if every point ran to the wire.
 */
async function defendMatch(host: Page, ana: Page): Promise<TvState> {
  const button = ana.getByRole("button", { name: "Tap left or right" });
  await expect(button).toBeVisible();

  let scheduledFor: number | null = null;
  for (let i = 0; i < 18_500; i++) {
    const state = await tvState(host);
    if (state === null) {
      await host.waitForTimeout(20);
      continue;
    }
    if (state.phase === "over") return state;
    const arriveAt = state.ball?.leg.arrivals["a-solo"];
    if (arriveAt !== undefined && arriveAt !== scheduledFor) {
      scheduledFor = arriveAt;
      void scheduleTap(button, Math.max(0, arriveAt - state.nowMs));
    }
    await host.waitForTimeout(20);
  }
  throw new Error("Bandeja match did not finish within the iteration budget");
}

test("a bot defends every arrival and wins a full match", async ({ host, phones }) => {
  test.setTimeout(300_000);

  const code = await openRoom(host);
  const [ana] = await phones(1, { motion: { permission: "denied" } });
  const [ben] = await phones(1, { motion: { permission: "granted" } });
  if (!ana || !ben) throw new Error("expected two phones");

  // Ana joins first, so she is the VIP and seat 0 (side A, `a-solo`); Ben is side B (`b-solo`).
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await expect(host.getByRole("region", { name: "Players" }).getByText("2/8")).toBeVisible();

  await watchTv(host);

  // Ana opens the game menu on her phone and picks Bandeja, a motion game. The TV counts down from
  // 3, then shows the motion step.
  await ana.getByRole("button", { name: "Choose a game" }).tap();
  const tvMenu = host.getByRole("region", { name: "Game menu" });
  await expect(tvMenu.getByText("Bandeja", { exact: true })).toBeVisible();
  const bandeja = ana.getByRole("button", { name: "Bandeja" });
  await expect(bandeja).toContainText("Motion");
  await bandeja.tap();
  await expect(tvMenu.getByText("Starting in")).toBeVisible();
  await expect(host.getByRole("region", { name: "Motion step" })).toBeVisible({ timeout: 15_000 });

  // Ana's browser says no: she plays with touch. Ben's phone rests in his hand, calibrates and
  // stays in motion mode without ever swinging.
  await ana.getByRole("button", { name: "Tap to enable motion" }).tap();
  await expect(ana.getByRole("heading", { name: "Touch controls it is" })).toBeVisible();
  await ana.getByRole("button", { name: "Ready" }).tap();

  const resting = holdStill(ben);
  let final: TvState;
  try {
    await ben.getByRole("button", { name: "Tap to enable motion" }).tap();
    await expect(host.getByRole("region", { name: "Motion step" })).toHaveCount(0, {
      timeout: 15_000,
    });

    final = await defendMatch(host, ana);
  } finally {
    await resting.stop();
  }

  // Ana's side won every rally it needed to.
  expect(final.phase).toBe("over");
  expect(final.scores.a).toBeGreaterThanOrEqual(7);
  expect(final.scores.a).toBeGreaterThan(final.scores.b);

  // The TV shows the final standings with Ana as the winner. Only Ana, the VIP, gets "Play again";
  // Ben sees his placement (docs/architecture/session-flow.md, "Results").
  const tvResults = host.getByRole("region", { name: "Results" });
  await expect(tvResults.getByRole("heading", { name: "Ana wins!" })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Play again" })).toBeVisible();
  await expect(ben.getByText("2nd")).toBeVisible();
  await expect(ben.getByRole("button", { name: "Play again" })).toHaveCount(0);
});
