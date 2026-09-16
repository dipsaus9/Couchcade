import type { JsonValue, PhoneToRelayMessage } from "@couchcade/protocol";

/**
 * The `results` view from the host (docs/architecture/session-flow.md, "Results"). Every in-game
 * player gets `place`, `of` and `score`; the VIP also gets `vip`, so their phone shows "Play again"
 * and "Back to menu". apps/host/src/screens/results/results.ts builds it.
 */
export interface ResultsView {
  /** The game's title, for "<title> is over". */
  title: string;
  /** The current VIP's name, or null if nobody qualifies. */
  vipName: string | null;
  /** Missing when this phone wasn't in the game that just ended (a late joiner, or the VIP). */
  place?: number;
  of?: number;
  score?: number;
  /** Only the VIP gets this: whether "Play again" is enabled, and why not when it isn't. */
  vip?: { canPlayAgain: boolean; hint: string | null };
}

type UiActionMessage = Extract<PhoneToRelayMessage, { t: "ui:action" }>;

/** The results view in `data`, or null when it isn't one. */
export function parseResultsView(data: JsonValue): ResultsView | null {
  if (!isRecord(data) || typeof data.title !== "string") return null;
  const place = typeof data.place === "number" ? data.place : undefined;
  const of = typeof data.of === "number" ? data.of : undefined;
  const score = typeof data.score === "number" ? data.score : undefined;
  const vipName = typeof data.vipName === "string" ? data.vipName : null;
  const vip = parseVip(data.vip);
  return { title: data.title, vipName, place, of, score, vip };
}

function parseVip(value: JsonValue | undefined): ResultsView["vip"] {
  if (value === undefined || !isRecord(value)) return undefined;
  return {
    canPlayAgain: value.canPlayAgain === true,
    hint: typeof value.hint === "string" ? value.hint : null,
  };
}

/** "1st", "2nd", "3rd", "4th", "11th", ... */
export function placeLabel(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

/** The `ui:action` messages the VIP's results screen sends (session-flow.md, "Results"). */
export const resultsActions = {
  playAgain: (): UiActionMessage => ({ t: "ui:action", d: { action: "play-again" } }),
  backToMenu: (): UiActionMessage => ({ t: "ui:action", d: { action: "back-to-menu" } }),
};

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
