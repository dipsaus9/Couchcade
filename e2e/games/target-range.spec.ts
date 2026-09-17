import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import { playMotionTrace, type MotionTrace } from "../src/motion.ts";

// Bots play a whole Target Range match (docs/games/target-range.md): one TV, two phones, 4 rounds of
// 3 arrows.
//
// The match starts the way people start it: the VIP picks Target Range on her phone, the TV counts
// down from 3, and the motion step runs (docs/architecture/session-flow.md, "Game menu", and
// motion.md, "Permission, calibration and resume flow"). Each phone gets the fake sensor adapter
// through `window.__couchcadeMotion` (e2e/README.md, "Motion sensors"):
//
// - Ana's browser denies motion, so she plays with touch. She aims exactly: she reads the target and
//   the wind from the TV, drags the aim pad to where a full draw lands in the gold, and pulls a full
//   draw. She scores (almost) a bullseye with every arrow.
// - Ben's browser grants motion. His phone rests in his hand the whole match, so every arrow flies
//   from the crosshair's home at full draw. The rules roll every target at least 6 px away from
//   where such an arrow lands (spec, "Arrow flight"), so he never beats a bullseye and mostly misses.
//
// That makes Ana the winner whatever the seed rolls. As in games/quick-draw.spec.ts, the bots read
// the TV's game state through the host's stage in the Vite dev build.

/** Round constants the bots aim with (games/target-range/src/shared/constants.ts). */
const rounds = [
  { dropPx: 4, windPx: 0 },
  { dropPx: 8, windPx: 3 },
  { dropPx: 14, windPx: 4 },
  { dropPx: 14, windPx: 4 },
];
/** The crosshair's home in the TV world, and world px per unit of yaw and pitch. */
const home = { x: 240, y: 140 };
const unitPx = { yaw: 200, pitch: 90 };
/** Pad px per unit of yaw and pitch: 200 px drag the whole −1..1 yaw range, 150 px pitch. */
const padPx = { yaw: 100, pitch: 75 };
/** A pull past 150 px is a full draw (games/target-range/src/controller/draw.ts). */
const fullPullPx = 160;

/** The subset of Target Range's state (games/target-range/src/shared/state.ts) the bots read. */
interface TvState {
  phase: "intro" | "open" | "landing" | "reveal" | "roundEnd" | "over";
  round: number;
  arrow: number;
  target: { x: number; y: number };
  winds: number[];
  players: { name: string; points: number; result: number | "late" | "none" | null }[];
}

declare global {
  interface Window {
    __targetRangeState?: () => TvState;
  }
}

/**
 * Makes the TV's running game state readable as `window.__targetRangeState`. The host starts a
 * game's scene through `phaserStage.start(game, { getState })`, and a dynamic import of the same
 * dev-server URL returns the module instance the app already runs.
 */
async function watchTv(host: Page): Promise<void> {
  await host.evaluate(async () => {
    const url = "/host/src/runtime/stage.ts";
    const { phaserStage } = await import(/* @vite-ignore */ url);
    const start = phaserStage.start.bind(phaserStage);
    phaserStage.start = (game: unknown, data: { getState: () => TvState }) => {
      window.__targetRangeState = data.getState;
      return start(game, data);
    };
  });
}

/** The TV's game state, or null before a game started. */
function tvState(host: Page): Promise<TvState | null> {
  return host.evaluate(() => window.__targetRangeState?.() ?? null);
}

/** Waits until the TV has `arrow` of `round` open, and returns the state. */
async function volleyOpen(host: Page, round: number, arrow: number): Promise<TvState> {
  await host.waitForFunction(
    ([r, a]) => {
      const state = window.__targetRangeState?.();
      return state?.phase === "open" && state.round === r && state.arrow === a;
    },
    [round, arrow] as const,
    { polling: 100, timeout: 20_000 },
  );
  const state = await tvState(host);
  if (state === null) throw new Error("the TV has no game state");
  return state;
}

/** Waits for the phone's draw button for `arrow`, then touches it and pulls a full draw. */
async function pullFullDraw(phone: Page, arrow: number): Promise<void> {
  await expect(phone.getByRole("status")).toHaveText(`Arrow ${arrow} of 3`);
  const box = await phone.getByRole("button", { name: "Pull down to draw" }).boundingBox();
  if (box === null) throw new Error("the draw button is not on screen");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await phone.mouse.move(x, y);
  await phone.mouse.down();
  await phone.mouse.move(x, y + fullPullPx, { steps: 4 });
  await expect(phone.getByRole("button", { name: "Full draw!" })).toBeVisible();
  await phone.mouse.up();
  await expect(phone.getByRole("status")).toHaveText("Arrow away!");
}

/**
 * Ana's touch shot: Centre, then one drag on the pad to the aim point where a full draw lands on the
 * target centre (wind drifts it sideways, gravity drops it), then a full draw.
 */
async function aimAndShoot(phone: Page, state: TvState): Promise<void> {
  const rules = rounds[state.round - 1];
  if (rules === undefined) throw new Error(`no rules for round ${state.round}`);
  const wind = state.winds[state.arrow - 1] ?? 0;
  const aimX = state.target.x - wind * rules.windPx;
  const aimY = state.target.y - rules.dropPx;
  const yaw = (aimX - home.x) / unitPx.yaw;
  const pitch = (home.y - aimY) / unitPx.pitch;
  // Right is positive yaw, and up the pad is positive pitch.
  const dx = Math.round(yaw * padPx.yaw);
  const dy = -Math.round(pitch * padPx.pitch);

  await expect(phone.getByRole("status")).toHaveText(`Arrow ${state.arrow} of 3`);
  await phone.getByRole("button", { name: "Centre" }).click();
  const pad = await phone.getByRole("application", { name: "Aim pad" }).boundingBox();
  if (pad === null) throw new Error("the aim pad is not on screen");
  // The drag is centred on the pad, so it stays on it.
  const startX = Math.round(pad.x + pad.width / 2 - dx / 2);
  const startY = Math.round(pad.y + pad.height / 2 - dy / 2);
  await phone.mouse.move(startX, startY);
  await phone.mouse.down();
  await phone.mouse.move(startX + dx, startY + dy, { steps: 4 });
  await phone.mouse.up();
  await pullFullDraw(phone, state.arrow);
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

test("two bots play a full match and the one who aims wins", async ({ host, phones }) => {
  test.setTimeout(240_000);

  const code = await openRoom(host);
  const [ana] = await phones(1, { motion: { permission: "denied" } });
  const [ben] = await phones(1, { motion: { permission: "granted" } });
  if (!ana || !ben) throw new Error("expected two phones");

  // Ana joins first, so she is the VIP.
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await expect(host.getByRole("region", { name: "Players" }).getByText("2/8")).toBeVisible();

  await watchTv(host);

  // Ana opens the game menu on her phone and picks Target Range, a motion game. The TV counts down
  // from 3, then shows the motion step.
  await ana.getByRole("button", { name: "Choose a game" }).tap();
  const tvMenu = host.getByRole("region", { name: "Game menu" });
  await expect(tvMenu.getByText("Target Range", { exact: true })).toBeVisible();
  const targetRange = ana.getByRole("button", { name: "Target Range" });
  await expect(targetRange).toContainText("Motion");
  await targetRange.tap();
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

    await expect.poll(async () => (await tvState(host))?.round, { timeout: 15_000 }).toBe(1);
    // 12 volleys. Both bots shoot in every one, so each volley closes as soon as both arrows are away.
    for (let round = 1; round <= 4; round++) {
      for (let arrow = 1; arrow <= 3; arrow++) {
        const state = await volleyOpen(host, round, arrow);
        await Promise.all([aimAndShoot(ana, state), pullFullDraw(ben, arrow)]);
      }
    }

    // The match ends after round 4. Ana, who aimed, has far more points than Ben, who didn't.
    await expect.poll(async () => (await tvState(host))?.phase, { timeout: 15_000 }).toBe("over");
  } finally {
    await resting.stop();
  }
  const final = await tvState(host);
  const points = Object.fromEntries(final?.players.map((p) => [p.name, p.points]) ?? []);
  expect(points["Ana"]).toBeGreaterThanOrEqual(100);
  expect(points["Ana"]).toBeGreaterThan(points["Ben"] ?? Infinity);

  // The TV shows the final standings with Ana as the winner. Only Ana, the VIP, gets "Play again";
  // Ben sees his placement (docs/architecture/session-flow.md, "Results").
  const tvResults = host.getByRole("region", { name: "Results" });
  await expect(tvResults.getByRole("heading", { name: "Ana wins!" })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Play again" })).toBeVisible();
  await expect(ben.getByText("2nd")).toBeVisible();
  await expect(ben.getByRole("button", { name: "Play again" })).toHaveCount(0);
});
