import type { Page } from "@playwright/test";
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import {
  cutLink,
  expectedLinkPath,
  framesOfType,
  hasRtcApi,
  linkPath,
  recordRelayFrames,
  waitForHostConnected,
  waitForLinkPath,
  type RelayFrame,
} from "../src/link.ts";
import { playMotionTrace, type MotionTrace } from "../src/motion.ts";

// The real-time link's browser wiring (docs/architecture/realtime-link.md, "Testing"): a phone
// reaches the direct path, input flows over it, the link falls back to relay when it is cut, and
// the phone relinks after a TV reload. Both apps' link switch defaults off (`link-switch.ts`), so a
// test that wants the link opens with `?link=1` by navigating there directly (the host and phone
// fixtures land on `/host/` and `/` first; a second `goto` before anything else happens adds the
// query string for that page load).
//
// WebRTC between two browser contexts on a GitHub-hosted runner can be slow to negotiate, so every
// wait below is generous. Chromium must always complete a direct connection and keep it up for a
// whole match -- the first two specs require it there, failing the test if it doesn't, since AC1
// says the direct path must be shown, not merely attempted.
//
// Playwright's own WebKit build is a different story: it exposes `RTCPeerConnection`, and CI runs
// have shown it can even reach `direct` once, but a real connection over it hasn't reliably carried
// a whole 12-volley match -- the data flow stalls partway through in a way the fake link's unit
// tests can't reach, an unknown limitation realtime-link.md itself flags ("Playwright WebKit has no
// WebRTC"; Risks, "Less E2E coverage"). So the first two specs never turn WebKit's link on at all
// (no `?link=1` there): the match always plays over the relay path, the one CI has proven reliable,
// and `hasRtcApi` only reports what the engine exposes for the task notes (AC4), never gates
// anything. The third spec is lighter -- no real-time gameplay, just a reconnect -- and has been
// reliably green on WebKit's direct path across CI runs, so it keeps using `expectedLinkPath` to
// observe the path WebKit actually settles on instead of assuming relay-only.
//
// AC1 and AC2 drive a whole Target Range match (docs/games/target-range.md) to prove input flows
// over a real link during real play, not just at idle. The match-driving helpers below are the same
// technique games/target-range.spec.ts uses -- kept local to this file rather than shared, so this
// spec's own References stay exactly the two files the story declares.

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
// `padPxPerCssPx = 1.5` (games/target-range/src/shared/constants.ts, CC-11.9): the whole −1..1
// yaw range is a 2 × 200 / 1.5 ≈ 266.7 px drag, pitch 2 × 90 / 1.5 = 120 px.
/** Pad px per unit of yaw and pitch. */
const padPx = { yaw: (2 * unitPx.yaw) / 1.5 / 2, pitch: (2 * unitPx.pitch) / 1.5 / 2 };
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
  const ruleset = rounds[state.round - 1];
  if (ruleset === undefined) throw new Error(`no rules for round ${state.round}`);
  const wind = state.winds[state.arrow - 1] ?? 0;
  const aimX = state.target.x - wind * ruleset.windPx;
  const aimY = state.target.y - ruleset.dropPx;
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

/**
 * Ana joins first (so she is the VIP), then Ben. Ana opens the game menu and picks Target Range;
 * the TV counts down and shows the motion step. Ana's browser denies motion, so she falls back to
 * touch; Ben's browser grants it and his phone rests in a hand, so he calibrates with motion.
 * Resolves once the motion step has cleared and the TV is about to open round 1.
 */
async function startMatch(host: Page, ana: Page, ben: Page, code: string): Promise<void> {
  await joinRoom(ana, code, "Ana");
  await joinRoom(ben, code, "Ben");
  await expect(host.getByRole("region", { name: "Players" }).getByText("2/8")).toBeVisible();

  await watchTv(host);

  await ana.getByRole("button", { name: "Choose a game" }).tap();
  const tvMenu = host.getByRole("region", { name: "Game menu" });
  await expect(tvMenu.getByText("Target Range", { exact: true })).toBeVisible();
  const targetRange = ana.getByRole("button", { name: "Target Range" });
  await expect(targetRange).toContainText("Motion");
  await targetRange.tap();
  await expect(tvMenu.getByText("Starting in")).toBeVisible();
  await expect(host.getByRole("region", { name: "Motion step" })).toBeVisible({ timeout: 15_000 });

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
  } finally {
    await resting.stop();
  }
}

/**
 * Plays a whole match (4 rounds of 3 arrows) with `ana` aiming exactly with touch and `ben` resting
 * a motion phone in his hand the whole time, so `ana` wins whatever the seed rolls (spec, "Arrow
 * flight"). `beforeVolley`, when given, runs right after each volley opens and before either bot
 * shoots -- for a test that needs to act on the TV or a phone mid-match, such as cutting the link.
 */
async function playFullMatch(
  host: Page,
  ana: Page,
  ben: Page,
  options: { beforeVolley?(round: number, arrow: number, state: TvState): Promise<void> } = {},
): Promise<void> {
  const resting = holdStill(ben);
  try {
    for (let round = 1; round <= 4; round++) {
      for (let arrow = 1; arrow <= 3; arrow++) {
        const state = await volleyOpen(host, round, arrow);
        await options.beforeVolley?.(round, arrow, state);
        await Promise.all([aimAndShoot(ana, state), pullFullDraw(ben, arrow)]);
      }
    }
    await expect.poll(async () => (await tvState(host))?.phase, { timeout: 15_000 }).toBe("over");
  } finally {
    await resting.stop();
  }
}

test("a phone reaches the direct link and plays a full Target Range match with no input on the relay socket", async ({
  host,
  phones,
  browserName,
}) => {
  test.setTimeout(240_000);

  // Only turn the link on when this engine reliably sustains one (module comment): Chromium
  // always; WebKit never for a whole match, so it plays over the same relay path the
  // untouched games/target-range.spec.ts already proves reliable in CI.
  const linkQuery = browserName === "webkit" ? "" : "?link=1";
  await host.goto(`/host/${linkQuery}`);
  const code = await openRoom(host);
  let anaFrames: { sent: RelayFrame[]; received: RelayFrame[] } | undefined;
  const [ana] = await phones(1, {
    motion: { permission: "denied" },
    beforeLoad: (page) => {
      anaFrames = recordRelayFrames(page);
    },
  });
  const [ben] = await phones(1, { motion: { permission: "granted" } });
  if (!ana || !ben || !anaFrames) throw new Error("expected two phones");
  await ana.goto(`/${linkQuery}`);
  await ben.goto(`/${linkQuery}`);

  if (browserName === "webkit") {
    test.info().annotations.push({
      type: "note",
      description: `WebKit RTCPeerConnection present: ${await hasRtcApi(ana)}; asserting the relay path for this match (AC4)`,
    });
  }

  await startMatch(host, ana, ben, code);
  let path: "direct" | "relay" = "relay";
  if (browserName !== "webkit") {
    await waitForLinkPath(ana, "direct", 30_000);
    path = "direct";
  }

  await playFullMatch(host, ana, ben);

  if (path === "direct") {
    // On the direct path, aim and shot samples travel over the data channel and never touch the
    // relay socket: no `input` frame should have gone out on it during the whole match.
    expect(framesOfType(anaFrames.sent, "input")).toHaveLength(0);
    expect(await linkPath(ana)).toBe("direct");
  }
});

test("cutting the link moves the phone to relay within 1 second and the match still completes", async ({
  host,
  phones,
  browserName,
}) => {
  test.setTimeout(240_000);

  // There is nothing to cut on an engine that can't sustain a real direct connection through a
  // whole match (module comment): skip cleanly instead of attempting one.
  test.skip(
    browserName === "webkit",
    "WebKit doesn't reliably sustain a direct connection through a whole match in CI: nothing to cut (AC4)",
  );

  await host.goto("/host/?link=1");
  const code = await openRoom(host);
  const [ana] = await phones(1, { motion: { permission: "denied" } });
  const [ben] = await phones(1, { motion: { permission: "granted" } });
  if (!ana || !ben) throw new Error("expected two phones");
  await ana.goto("/?link=1");
  await ben.goto("/?link=1");

  await startMatch(host, ana, ben, code);
  await waitForLinkPath(ana, "direct", 30_000);

  let cutOnce = false;
  await playFullMatch(host, ana, ben, {
    beforeVolley: async (round, arrow) => {
      if (cutOnce || round !== 1 || arrow !== 1) return;
      cutOnce = true;
      const cutAt = Date.now();
      await cutLink(ana);
      await waitForLinkPath(ana, "relay", 1_000);
      expect(Date.now() - cutAt).toBeLessThan(1_000);
    },
  });

  const final = await tvState(host);
  expect(final?.phase).toBe("over");
});

test("a TV reload brings the phone's link back after room:host connected true", async ({
  host,
  phones,
  browserName,
}) => {
  test.setTimeout(120_000);

  await host.goto("/host/?link=1");
  const code = await openRoom(host);
  let frames: { sent: RelayFrame[]; received: RelayFrame[] } | undefined;
  const [ana] = await phones(1, {
    beforeLoad: (page) => {
      frames = recordRelayFrames(page);
    },
  });
  if (!ana || !frames) throw new Error("expected a phone");
  await ana.goto("/?link=1");

  await joinRoom(ana, code, "Ana");
  const path = await expectedLinkPath(ana, browserName, 30_000);
  if (path !== "direct") {
    test.info().annotations.push({
      type: "note",
      description: "this engine never reached the direct link: asserting the relay path (AC4)",
    });
  }

  const sinceIndex = frames.received.length;
  await host.reload();

  await waitForHostConnected(ana, frames, true, sinceIndex, 30_000);
  await waitForLinkPath(ana, path, 30_000);
});
