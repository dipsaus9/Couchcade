import type { Player } from "@couchcade/game-sdk/contract";
import type { ControllerView } from "@couchcade/protocol";
import { targetPoints } from "./constants.ts";
import { slotSpec } from "./state.ts";
import { findPlayerBySlot, isAutoSlot, matchSlots, otherSide } from "./state.ts";
import type { BandejaPlayer, BandejaState } from "./state.ts";
import type { SlotName } from "./constants.ts";

export type BandejaScreen = "bj-play" | "bj-end";

/** View data (docs/games/bandeja.md, "Phone controller", "Screens"). Well under 1 KB. */
export type BandejaView = {
  side: "a" | "b";
  slot: "left" | "right" | "solo";
  scores: [a: number, b: number];
  target: number;
  /** The point about to be played, echoed in `swing`. */
  point: number;
  /** `null` in singles; `""` when the slot auto-returns. */
  partner: string | null;
  /** 1 or 2 names. */
  opponents: string[];
  /** This player's side serves this point. */
  serving: boolean;
  last: {
    won: boolean;
    reason: "net" | "double-bounce" | "squeeze";
  } | null;
};

export type BandejaControllerView = ControllerView & {
  screen: BandejaScreen;
  data: BandejaView;
};

function slotPart(slot: SlotName): "left" | "right" | "solo" {
  if (slot.endsWith("left")) return "left";
  if (slot.endsWith("right")) return "right";
  return "solo";
}

/** The partner's name, `""` if their slot auto-returns, `null` in singles (no partner slot). */
function partnerName(state: BandejaState, player: BandejaPlayer): string | null {
  const sideSlots = matchSlots(state).filter((slot) => slotSpec(slot).side === player.side);
  if (sideSlots.length <= 1) return null;
  const partnerSlot = sideSlots.find((slot) => slot !== player.slot) as SlotName;
  if (isAutoSlot(state, partnerSlot)) return "";
  return findPlayerBySlot(state, partnerSlot)?.name ?? "";
}

/** 1 or 2 real opponent names; an empty auto slot (3 players) just isn't one. */
function opponentNames(state: BandejaState, player: BandejaPlayer): string[] {
  const oppSide = otherSide(player.side);
  const oppSlots = matchSlots(state).filter((slot) => slotSpec(slot).side === oppSide);
  const names: string[] = [];
  for (const slot of oppSlots) {
    const opponent = findPlayerBySlot(state, slot);
    if (opponent !== undefined) names.push(opponent.name);
  }
  return names;
}

function cueFor(state: BandejaState, player: BandejaPlayer): "your-turn" | "celebrate" | undefined {
  if (state.phase === "intro") return "your-turn";
  if (state.phase === "over") {
    const mine = state.scores[player.side];
    const theirs = state.scores[otherSide(player.side)];
    return mine > theirs ? "celebrate" : undefined;
  }
  if (state.lastPoint !== null && state.lastPoint.won === player.side) return "celebrate";
  return undefined;
}

/** What a phone shows (docs/games/bandeja.md, "Screens"). */
export function view(state: BandejaState, player: Player): BandejaControllerView {
  const current = state.players.find((p) => p.id === player.id);
  const screen: BandejaScreen = state.phase === "over" ? "bj-end" : "bj-play";
  const data: BandejaView = {
    side: current?.side ?? "a",
    slot: current === undefined ? "solo" : slotPart(current.slot),
    scores: [state.scores.a, state.scores.b],
    target: targetPoints,
    point: state.point,
    partner: current === undefined ? null : partnerName(state, current),
    opponents: current === undefined ? [] : opponentNames(state, current),
    serving: current !== undefined && current.side === state.serving,
    last:
      state.lastPoint === null || current === undefined
        ? null
        : { won: state.lastPoint.won === current.side, reason: state.lastPoint.reason },
  };
  const cue = current === undefined ? undefined : cueFor(state, current);
  return cue === undefined ? { screen, data } : { screen, data, cue };
}
