import type { Page } from "@playwright/test";

// Quick Draw bots for E2E specs (docs/games/quick-draw.md). The phone never shows DRAW!, only the TV
// does, so the bots watch the TV's game state: `watchTv` wraps the host's stage in the Vite dev
// build to read the running game's state.

/** How long each bot takes to react once the TV shows DRAW!. Valid taps land 100 to 1,500 ms in. */
const reactionMs = { fast: 250, slow: 900 };

/** The subset of Quick Draw's state (games/quick-draw/src/shared/state.ts) the bots read. */
export interface TvState {
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
export async function watchTv(host: Page): Promise<void> {
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
export function tvState(host: Page): Promise<TvState | null> {
  return host.evaluate(() => window.__quickDrawState?.() ?? null);
}

/** Waits for DRAW! on the TV, then taps the fast bot first and the slow bot later. */
export async function playRound(host: Page, fast: Page, slow: Page, round: number): Promise<void> {
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
