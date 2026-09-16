import type { ControllerView, JsonValue, PhoneToRelayMessage } from "@couchcade/protocol";

/**
 * The `menu` view from the host (docs/architecture/session-flow.md, "Menu view"). The phone has no
 * game code, so the VIP's game list arrives here: `[id, title, flags]` per game, in title order.
 * apps/host/src/screens/menu/menu.ts builds it.
 */
export interface MenuView {
  games: MenuItem[];
  picked: string | null;
  /** Room time when the picked game starts. */
  startsAt: number | null;
}

export interface MenuItem {
  id: string;
  title: string;
  /** False: the game doesn't fit the player count. It stays in the list, greyed out. */
  fits: boolean;
  needsMotion: boolean;
}

const flagFits = 1;
const flagNeedsMotion = 2;

type UiActionMessage = Extract<PhoneToRelayMessage, { t: "ui:action" }>;

/** The menu view in `data`, or null when it isn't one. */
export function parseMenuView(data: JsonValue): MenuView | null {
  if (!isRecord(data) || !Array.isArray(data.games)) return null;
  const games: MenuItem[] = [];
  for (const entry of data.games) {
    if (!Array.isArray(entry)) return null;
    const [id, title, flags] = entry;
    if (typeof id !== "string" || typeof title !== "string" || typeof flags !== "number") {
      return null;
    }
    games.push({
      id,
      title,
      fits: (flags & flagFits) !== 0,
      needsMotion: (flags & flagNeedsMotion) !== 0,
    });
  }
  const picked = typeof data.picked === "string" ? data.picked : null;
  const startsAt = typeof data.startsAt === "number" ? data.startsAt : null;
  return { games, picked, startsAt: picked === null ? null : startsAt };
}

/** True when the host's lobby view makes this phone the VIP, who gets the game buttons. */
export function isVipLobby(view: ControllerView | null): boolean {
  return view?.screen === "lobby" && isRecord(view.data) && view.data.vip === true;
}

/** The VIP's name in a `vip-choosing` view, or null. */
export function choosingName(view: ControllerView | null): string | null {
  if (view?.screen !== "vip-choosing" || !isRecord(view.data)) return null;
  return typeof view.data.name === "string" ? view.data.name : null;
}

/** Whole seconds left on the countdown, shown as "Starting in 3". Never below 1 while it runs. */
export function secondsLeft(startsAt: number, roomNow: number): number {
  return Math.max(1, Math.ceil((startsAt - roomNow) / 1000));
}

/** The `ui:action` messages the VIP's lobby and menu send (session-flow.md, "Game menu", flow). */
export const menuActions = {
  chooseGame: (): UiActionMessage => ({ t: "ui:action", d: { action: "start" } }),
  surpriseMe: (): UiActionMessage => ({ t: "ui:action", d: { action: "pick-game" } }),
  pick: (id: string): UiActionMessage => ({
    t: "ui:action",
    d: { action: "pick-game", value: id },
  }),
  cancel: (): UiActionMessage => ({ t: "ui:action", d: { action: "back-to-menu" } }),
};

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
