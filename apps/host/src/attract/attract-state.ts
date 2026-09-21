import type { GameMeta } from "@couchcade/game-sdk/contract";
import type { Scheduler } from "../runtime/timing.ts";

/** How long an empty lobby sits idle before the TV starts cycling game previews (CC-9.3 AC1). */
export const attractIdleMs = 60_000;

/** How long each game preview shows before the TV advances to the next one. */
export const attractPreviewMs = 6_000;

/** The game currently on screen, and where it sits in the cycle. */
export interface AttractPreview {
  game: GameMeta;
  index: number;
  total: number;
}

export interface AttractOptions {
  /** Every registered game, in the same order the menu shows them (CC-3.25's eager registry). */
  games: readonly GameMeta[];
  schedule: Scheduler;
  /** Defaults to `attractIdleMs`. */
  idleMs?: number;
  /** Defaults to `attractPreviewMs`. */
  previewMs?: number;
  /**
   * The idle timer fired, or the preview advanced: redraw. Never called from `lobbyChanged`
   * itself -- that transition is synchronous, so the caller (already mid-redraw) reads `active`
   * and `preview` right after calling it and needs no extra notification.
   */
  onChange(): void;
}

/**
 * Attract mode's own state machine (CC-9.3): an empty, otherwise-idle lobby waits `idleMs`, then
 * cycles every registered game's preview every `previewMs` until someone joins. It owns one pair
 * of timers and no socket, mirroring `createGameMenu`'s countdown timer in `screens/menu/menu.ts`.
 *
 * The caller (the lobby's own idle/player-count tracking in `use-host-session.ts`) is the only
 * thing that decides *when* the lobby is empty; this only decides what to do once told.
 */
export interface AttractState {
  /** True once the idle timer has fired and a preview is showing. */
  readonly active: boolean;
  /** The game currently previewed, or null while inactive or with no games registered. */
  readonly preview: AttractPreview | null;
  /**
   * Tells attract mode whether the lobby is empty (no players at all, seated or watching) right
   * now. Call on every lobby change. Starts the 60 s idle timer on the empty lobby's first tick
   * and cancels it -- along with any running preview cycle -- the instant the lobby isn't empty
   * any more (CC-9.3 AC2: any join returns to the lobby immediately, no leftover timer to race).
   * A repeat call with the same emptiness is a no-op, so redraws while the lobby stays empty (or
   * stays occupied) never restart the idle timer.
   */
  lobbyChanged(empty: boolean): void;
  /** Cancels every pending timer. */
  dispose(): void;
}

export function createAttractState(options: AttractOptions): AttractState {
  const idleMs = options.idleMs ?? attractIdleMs;
  const previewMs = options.previewMs ?? attractPreviewMs;
  const games = options.games;

  let idleTimer: (() => void) | null = null;
  let previewTimer: (() => void) | null = null;
  /** Whether the lobby is empty right now, as last told by `lobbyChanged`. */
  let idle = false;
  let active = false;
  let index = 0;

  function stopIdleTimer(): void {
    idleTimer?.();
    idleTimer = null;
  }

  function stopPreviewTimer(): void {
    previewTimer?.();
    previewTimer = null;
  }

  function advance(): void {
    index = (index + 1) % games.length;
    previewTimer = options.schedule(advance, previewMs);
    options.onChange();
  }

  function activate(): void {
    idleTimer = null;
    active = true;
    index = 0;
    previewTimer = options.schedule(advance, previewMs);
    options.onChange();
  }

  function deactivate(): void {
    stopPreviewTimer();
    active = false;
    index = 0;
  }

  return {
    get active() {
      return active;
    },
    get preview() {
      return active ? { game: games[index]!, index, total: games.length } : null;
    },
    lobbyChanged(empty) {
      // Nothing to ever preview: never start the idle timer (CC-9.3's cycling has nothing to
      // cycle through). A build always registers at least one game in practice (CC-3.25), but an
      // empty registry -- tests included -- just keeps the plain lobby showing.
      if (games.length === 0) return;
      if (empty === idle) return;
      idle = empty;
      if (empty) {
        idleTimer = options.schedule(activate, idleMs);
      } else {
        stopIdleTimer();
        deactivate();
      }
    },
    dispose() {
      stopIdleTimer();
      stopPreviewTimer();
    },
  };
}
