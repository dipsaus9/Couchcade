/**
 * What the phone shows right now (docs/games/target-range.md, "Screens"). Pure and framework-free,
 * so every controller state is a plain data assertion.
 *
 * The host sends `tr-watch` and `tr-shoot`. The phone adds its own local states on top: drawing,
 * too weak and shot. They change the instant a finger moves, before any round trip.
 */
import type { BigActionState } from "@couchcade/ui";
import type { CueToken } from "@couchcade/protocol";
import { arrowsPerRound, bullseyePoints, roundCount, rounds } from "../shared/constants.ts";
import type { TargetRangeScreen, TargetRangeView } from "../shared/view.ts";

/**
 * The phone's own part of a volley. `ready`: nothing happened yet. `drawing`: a finger is on the big
 * action. `weak`: the last draw was let go too early or cancelled. `shot`: the arrow is away.
 */
export type DrawPhase = "ready" | "drawing" | "weak" | "shot";

export interface LocalState {
  /** Motion aims with the phone, touch with the pad. */
  mode: "motion" | "touch";
  /** False until the room clock has synced. The draw button stays off until then. */
  synced: boolean;
  draw: DrawPhase;
  /** 0 to 1 while drawing. */
  power: number;
  /**
   * True when this `tr-watch` follows a volley this phone saw open, so it shows the result. False
   * for a round's intro.
   */
  afterVolley: boolean;
}

export interface TargetRangePresentation {
  /** The big action's fill and interactivity. */
  state: BigActionState;
  /** Under 40 characters. */
  actionLabel: string;
  /** The line above the big action. Under 40 characters. */
  statusLine: string;
  /** The line below the big action. Under 40 characters. */
  hint: string;
  /** How far the circle fills from the bottom, 0 to 1. */
  fill: number;
  /** True when the aim pad and its Centre button show: touch mode while a draw is possible. */
  pad: boolean;
  /** True when a `pointerdown` on the big action starts a draw. */
  canDraw: boolean;
  /** A one-shot haptic to play the moment this presentation first appears. */
  cue?: CueToken;
}

const watchTv = "Watch the TV";
const pullToDraw = "Pull down to draw";
const pointAtTv = "Point at the TV";
const dragPad = "Drag the pad to aim";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function roundStatus(data: TargetRangeView): string {
  return `Round ${data.round} of ${roundCount} · ${rounds[data.round - 1]?.name ?? ""}`;
}

/** The hint while a draw is possible: the last arrow of this round, or where to aim. */
function aimHint(data: TargetRangeView, mode: LocalState["mode"]): string {
  if (mode === "touch") return dragPad;
  if (data.arrow === 1 || data.last === null) return pointAtTv;
  if (data.last === "late") return "Last arrow was too late";
  if (data.last === "none") return pointAtTv;
  return data.last === 0 ? "Last arrow missed" : `Last arrow: ${data.last}`;
}

function resultLine(last: TargetRangeView["last"]): string {
  if (last === bullseyePoints) return "Bullseye!";
  if (last === "late") return "Too late for that one";
  if (last === "none" || last === null) return "No arrow this time";
  return last === 0 ? "Missed this time" : `You scored ${last}`;
}

const base = { fill: 0, pad: false, canDraw: false };

function watchScreen(data: TargetRangeView, local: LocalState): TargetRangePresentation {
  if (local.afterVolley) {
    return {
      ...base,
      state: "waiting",
      actionLabel: watchTv,
      statusLine: resultLine(data.last),
      hint: `${plural(data.points, "point")} so far`,
      ...(data.last === bullseyePoints ? { cue: "celebrate" as const } : {}),
    };
  }
  const firstRound = data.round === 1;
  return {
    ...base,
    state: "waiting",
    actionLabel: watchTv,
    statusLine: roundStatus(data),
    hint: !firstRound
      ? "Aim a little high"
      : local.mode === "touch"
        ? dragPad
        : "Hold on tight, point at the TV",
  };
}

function shootScreen(data: TargetRangeView, local: LocalState): TargetRangePresentation {
  const arrowLine = `Arrow ${data.arrow} of ${arrowsPerRound}`;
  if (!local.synced) {
    return {
      ...base,
      state: "disabled",
      actionLabel: "Wait…",
      statusLine: arrowLine,
      hint: watchTv,
    };
  }
  const touch = local.mode === "touch";
  switch (local.draw) {
    case "drawing":
      return {
        state: "hold",
        actionLabel: local.power >= 1 ? "Full draw!" : "Draw…",
        statusLine: "Let go to shoot",
        hint: "Hold steady",
        fill: local.power,
        pad: touch,
        canDraw: false,
      };
    case "weak":
      return {
        ...base,
        state: "hold",
        actionLabel: pullToDraw,
        statusLine: "Pull further to shoot",
        hint: touch ? dragPad : pointAtTv,
        pad: touch,
        canDraw: true,
      };
    case "shot":
      return {
        ...base,
        state: "disabled",
        actionLabel: "—",
        statusLine: "Arrow away!",
        hint: watchTv,
      };
    case "ready":
      return {
        ...base,
        state: "hold",
        actionLabel: pullToDraw,
        statusLine: arrowLine,
        hint: aimHint(data, local.mode),
        pad: touch,
        canDraw: true,
        ...(data.volley === 1 ? { cue: "your-turn" as const } : {}),
      };
  }
}

/** Maps the host's view plus this phone's local state to the screen. */
export function present(
  screen: TargetRangeScreen,
  data: TargetRangeView,
  local: LocalState,
): TargetRangePresentation {
  return screen === "tr-shoot" ? shootScreen(data, local) : watchScreen(data, local);
}
