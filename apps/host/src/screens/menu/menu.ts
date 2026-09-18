import type { ClockScheduler } from "@couchcade/game-sdk/clock";
import type { GameMeta } from "@couchcade/game-sdk/contract";
import type { GameMetaRegistry } from "@couchcade/game-sdk/registry";
import type { ControllerView, PayloadOf } from "@couchcade/protocol";
import { seatedPlayers, vip, type LobbyState } from "../lobby/lobby-state.ts";

/** How long the countdown runs after the VIP picks a game (session-flow.md, owner decision 2). */
export const countdownMs = 3000;

/** Bits in a menu view game's `flags`. */
export const menuFlags = { fits: 1, needsMotion: 2 } as const;

/**
 * The `menu` view the VIP's phone gets (session-flow.md, "Menu view"). The phone has no game code,
 * so the view carries the list: `[id, title, flags]` per game, in title order.
 */
export type MenuView = {
  games: Array<[id: string, title: string, flags: number]>;
  picked: string | null;
  /** Room time when the picked game starts. */
  startsAt: number | null;
};

/** One game on the menu, for the TV card. */
export interface MenuGame {
  id: string;
  title: string;
  min: number;
  max: number;
  needsMotion: boolean;
  /** True when the seated player count fits the game. False cards are grey and can't be picked. */
  fits: boolean;
}

/** The picked game and the room time it starts. */
export interface Countdown {
  gameId: string;
  startsAt: number;
}

export type UiAction = PayloadOf<"ui:action">;

/** A game fits when `players.min <= seated <= players.max`. A seat kept for a dropped phone counts. */
export function fits(game: Pick<GameMeta, "players">, seated: number): boolean {
  return game.players.min <= seated && seated <= game.players.max;
}

/** Every registered game, in the registry's title order, with its fit for `seated` players. */
export function menuGames(games: readonly GameMeta[], seated: number): MenuGame[] {
  return games.map((game) => ({
    id: game.id,
    title: game.title,
    min: game.players.min,
    max: game.players.max,
    needsMotion: game.needsMotion,
    fits: fits(game, seated),
  }));
}

export function menuView(games: readonly MenuGame[], countdown: Countdown | null): MenuView {
  return {
    games: games.map((game) => [
      game.id,
      game.title,
      (game.fits ? menuFlags.fits : 0) | (game.needsMotion ? menuFlags.needsMotion : 0),
    ]),
    picked: countdown?.gameId ?? null,
    startsAt: countdown?.startsAt ?? null,
  };
}

/**
 * "Surprise me": a random fitting game, never the game just played when another one fits. Null
 * when nothing fits.
 */
export function surprisePick(
  games: readonly MenuGame[],
  lastPlayed: string | null,
  random: () => number,
): string | null {
  const fitting = games.filter((game) => game.fits);
  const fresh = fitting.filter((game) => game.id !== lastPlayed);
  const pool = fresh.length > 0 ? fresh : fitting;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!.id;
}

/** "2 to 8 players", "Up to 4 players", "1 player". */
export function playerCountLabel(game: Pick<MenuGame, "min" | "max">): string {
  if (game.min === game.max) return `${game.min} ${game.min === 1 ? "player" : "players"}`;
  if (game.min === 1) return `Up to ${game.max} players`;
  return `${game.min} to ${game.max} players`;
}

/** Whole seconds left on a countdown, shown as "Starting in 3". Never below 1 while it runs. */
export function secondsLeft(startsAt: number, roomNow: number): number {
  return Math.max(1, Math.ceil((startsAt - roomNow) / 1000));
}

export interface GameMenuOptions {
  registry: GameMetaRegistry;
  /** The latest lobby state: who is seated and who is VIP. */
  lobby(): LobbyState | null;
  /** Room time now, in milliseconds. */
  roomNow(): number;
  schedule: ClockScheduler;
  /** A number in [0, 1) for "Surprise me". Defaults to `Math.random`. */
  random?: () => number;
  /**
   * The countdown ended on a game that still fits. The runtime loads and starts it (CC-3.25: the
   * menu only ever holds metadata, never the game's full rules).
   */
  onStart(gameId: string): void;
  /** The menu opened, or its pick or countdown changed. */
  onChange(): void;
}

export interface GameMenu {
  /** True from the VIP's "Choose a game" until a game starts. */
  readonly open: boolean;
  readonly countdown: Countdown | null;
  /**
   * Applies a `ui:action` from `from`, outside a game (session-flow.md, "Game menu", flow). Only
   * the current VIP counts. `start` opens the menu, `pick-game` picks a fitting game (or a
   * surprise one without a value) and starts or restarts the countdown, `back-to-menu` cancels it.
   */
  action(from: string, action: UiAction): void;
  /** The games with their fit for the current seated count. */
  games(): MenuGame[];
  /** What each seated phone shows while the menu is open, by player id. */
  views(): Map<string, ControllerView>;
  /** A game started: closes the menu and remembers the game for "Surprise me". */
  close(gameId: string): void;
  /** Cancels a running countdown timer. */
  dispose(): void;
}

/**
 * The game menu on the host: the VIP picks on their phone, the TV follows, and a 3 second
 * countdown the VIP can change or cancel starts the game. It owns one timer and no socket.
 */
export function createGameMenu(options: GameMenuOptions): GameMenu {
  const random = options.random ?? Math.random;
  let open = false;
  let countdown: Countdown | null = null;
  let cancelTimer: (() => void) | null = null;
  let lastPlayed: string | null = null;

  const seated = (): number => {
    const lobby = options.lobby();
    return lobby === null ? 0 : seatedPlayers(lobby).length;
  };
  const games = (): MenuGame[] => menuGames(options.registry.games, seated());

  function stopTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  function pick(gameId: string): void {
    stopTimer();
    const picked = { gameId, startsAt: Math.round(options.roomNow()) + countdownMs };
    countdown = picked;
    cancelTimer = options.schedule(() => {
      cancelTimer = null;
      if (countdown !== picked) return;
      countdown = null;
      const game = options.registry.get(gameId);
      // Players may have left during the countdown. Then the card turns grey and nothing starts.
      if (game !== undefined && fits(game, seated())) options.onStart(gameId);
      else options.onChange();
    }, countdownMs);
  }

  return {
    get open() {
      return open;
    },
    get countdown() {
      return countdown;
    },

    action(from, { action, value }) {
      const lobby = options.lobby();
      if (lobby === null || from !== vip(lobby)?.id) return;
      switch (action) {
        case "start":
          if (open) return;
          open = true;
          break;
        case "pick-game": {
          const id = value === undefined ? surprisePick(games(), lastPlayed, random) : value;
          const game = id === null ? undefined : options.registry.get(id);
          if (game !== undefined && fits(game, seated())) {
            open = true;
            pick(game.id);
          } else if (value === undefined && !open) {
            // "Surprise me" with nothing that fits still opens the menu, so the VIP sees why.
            open = true;
          } else {
            return;
          }
          break;
        }
        case "back-to-menu":
          if (!open || countdown === null) return;
          stopTimer();
          countdown = null;
          break;
        default:
          return;
      }
      options.onChange();
    },

    games,

    views() {
      const lobby = options.lobby();
      const views = new Map<string, ControllerView>();
      if (lobby === null) return views;
      const leader = vip(lobby);
      const menu: ControllerView = { screen: "menu", data: menuView(games(), countdown) };
      // During the countdown everyone but the VIP just watches the TV.
      const others: ControllerView =
        countdown === null
          ? { screen: "vip-choosing", data: { name: leader?.name ?? null } }
          : { screen: "waiting", data: null };
      for (const player of seatedPlayers(lobby)) {
        views.set(player.id, player.id === leader?.id ? menu : others);
      }
      return views;
    },

    close(gameId) {
      stopTimer();
      open = false;
      countdown = null;
      lastPlayed = gameId;
    },

    dispose() {
      stopTimer();
      countdown = null;
    },
  };
}
