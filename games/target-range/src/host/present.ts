import { motion } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import {
  arrowsPerRound,
  bullseyePoints,
  currentWind,
  revealMs,
  roundCount,
  roundRules,
  volleyMs,
  volleyOf,
} from "../shared/index.ts";
import type {
  Arrow,
  Phase,
  Point,
  TargetRangePlayer,
  TargetRangeState,
  VolleyResult,
} from "../shared/index.ts";
import { bowPoint, calloutAt, flagFoot, pipSlots } from "./layout.ts";
import type { PipSlot } from "./layout.ts";

/**
 * What the TV shows for a state: a pure function of the state and the options. Every animation
 * runs on game time (`state.nowMs`), so the same state always looks the same, in a replay as much
 * as live.
 */

/** The wind flag flaps at 8 fps (HOUSE_STYLE: 8 to 12 fps). */
export const flagFrameMs = 125;
/** A stuck arrow wobbles for 2 frames of 10 fps as it lands. */
export const wobbleFrameMs = 100;
/** How long the target takes to slide to a new round's spot. */
export const targetSlideMs = 800;
/** How high a flying arrow's arc rises above the straight line, in world px. */
export const arcPx = 18;

/** Due times sit on the tick grid. Half a tick of slack absorbs float rounding, as in the rules. */
const slackMs = tickMs / 2;

export type Expression = "neutral" | "happy" | "surprised";

export interface PipPresentation {
  id: string;
  slot: PipSlot;
  /** The seat expired: the Pip stays on the range but shoots no more. */
  left: boolean;
  expression: Expression;
  blink: boolean;
  /** The bow is lifted from the shot until the volley is revealed. */
  bowRaised: boolean;
}

export interface CrosshairPresentation {
  id: string;
  /** The world pixel the phone points at, 250 ms behind. */
  x: number;
  y: number;
}

export interface FlyingArrowPresentation {
  id: string;
  x: number;
  y: number;
  /** 2 is the full 7×3 arrow, 1 is 5×3, 0 is 3×3 as it nears the target. */
  size: 0 | 1 | 2;
  /** 1 flies to the right, -1 to the left. */
  facing: 1 | -1;
}

export interface StuckArrowPresentation {
  id: string;
  /** The landing pixel, wobble included. */
  x: number;
  y: number;
  /** Shot in the current volley: it shows its player's shape. Older arrows show only the stub. */
  newest: boolean;
}

export interface WindPresentation {
  /** 0 to 4. */
  strength: number;
  /** 1 blows to the right, -1 to the left, 0 is calm. */
  direction: 1 | -1 | 0;
  /** The flag's animation frame, 0 to 2. */
  frame: number;
  /** The foot of the flag pole. */
  foot: Point;
}

/** A player's result under their scoreboard chip during the reveal. */
export interface PointsTagPresentation {
  id: string;
  text: string;
  /** `bullseye` for a 10, `hit` for other points, `miss` for a miss, a late shot or no shot. */
  tone: "bullseye" | "hit" | "miss";
  /** The `ui` pop-in, 0 to 1. Always 1 with reduced motion. */
  pop: number;
}

export interface ResultRow {
  id: string;
  name: string;
  /** Points of each of the round's arrows, null for a late shot or no shot. */
  arrows: (number | null)[];
  roundPoints: number;
  points: number;
}

export interface RoundResultsPresentation {
  title: string;
  /** Most points first, then most bullseyes, then seat order. */
  rows: ResultRow[];
}

export interface Presentation {
  phase: Phase;
  round: number;
  arrow: number;
  target: Point & { radius: number };
  wind: WindPresentation;
  pips: PipPresentation[];
  /** In seat order, so overlapping crosshairs never swap places. */
  crosshairs: CrosshairPresentation[];
  flying: FlyingArrowPresentation[];
  stuck: StuckArrowPresentation[];
  /** The bottom instruction panel. */
  panel: string;
  /** Whole seconds left in the volley, while it is open. */
  clock: number | null;
  tags: PointsTagPresentation[];
  /** `BULLSEYE!` during a reveal where anyone hit a 10, with a key unique to that volley. */
  callout: { text: string; key: string; at: Point } | null;
  results: RoundResultsPresentation | null;
}

export interface PresentOptions {
  reducedMotion: boolean;
  /** Where the target stood last round, so it slides from there. Null for no slide. */
  previousTarget?: Point | null;
  /**
   * Each aiming player's crosshair, already played back by `createCrosshairPlayback`
   * (`aim-playback.ts`, CC-11.9): `present` only threads them through, so it stays a pure function
   * of `state` and these options. Defaults to none, such as before the scene has a frame to play back.
   */
  crosshairs?: readonly CrosshairPresentation[];
}

/** "Noor", "Noor and Sam", "Noor, Sam and Kim". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "Round 2 of 4: middle". */
export function roundTitle(round: number): string {
  return `Round ${round} of ${roundCount}: ${roundRules(round).name}`;
}

/** "No wind", "Wind 1 to the left", "Wind 3 to the right". */
export function windText(wind: number): string {
  if (wind === 0) return "No wind";
  return `Wind ${Math.abs(wind)} to the ${wind > 0 ? "right" : "left"}`;
}

const article = (points: number): string => (points === 8 ? "an" : "a");

const shownPoints = (result: VolleyResult | null): number =>
  typeof result === "number" ? result : 0;

/** The bottom panel, in the referee voice (spec, "Round flow and timings" and "Edge cases"). */
export function panelText(state: TargetRangeState): string {
  switch (state.phase) {
    case "intro":
      return state.round === 1 ? "Point at the TV, pull down, let go" : roundTitle(state.round);
    case "open":
    case "landing":
      return `Arrow ${state.arrow} of ${arrowsPerRound}, ${windText(currentWind(state)).toLowerCase()}`;
    case "reveal": {
      const best = Math.max(0, ...state.players.map((player) => shownPoints(player.result)));
      if (best === 0) return "Tricky wind, that one";
      const names = state.players
        .filter((player) => shownPoints(player.result) === best)
        .map((player) => player.name);
      return `${listNames(names)} hit ${article(best)} ${best}`;
    }
    case "roundEnd":
    case "over": {
      const best = Math.max(0, ...state.players.map((player) => player.points));
      if (best === 0) return "Nobody has scored yet";
      const names = state.players
        .filter((player) => player.points === best)
        .map((player) => player.name);
      const verb =
        state.phase === "over"
          ? names.length === 1
            ? "wins"
            : "win"
          : names.length === 1
            ? "leads"
            : "lead";
      return `${listNames(names)} ${verb} with ${best}`;
    }
  }
}

function pipExpression(state: TargetRangeState, player: TargetRangePlayer): Expression {
  if (state.phase !== "reveal" || player.left) return "neutral";
  if (player.result === 9 || player.result === bullseyePoints) return "happy";
  return player.result === 0 ? "surprised" : "neutral";
}

/** Pips blink for one frame every 2.4 s while a volley is open, each on its own beat. */
function blinking(state: TargetRangeState, index: number): boolean {
  return state.phase === "open" && (state.nowMs + index * 700) % 2400 < wobbleFrameMs;
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function targetPosition(state: TargetRangeState, options: PresentOptions): Point {
  const from = options.previousTarget;
  if (state.phase !== "intro" || from == null || options.reducedMotion) return state.target;
  const t = Math.min(1, Math.max(0, (state.nowMs - state.phaseAtMs) / targetSlideMs));
  const eased = easeInOut(t);
  return {
    x: Math.round(from.x + (state.target.x - from.x) * eased),
    y: Math.round(from.y + (state.target.y - from.y) * eased),
  };
}

/** Arrows of this round that are drawn: all of them, until they're pulled at the round's end. */
function arrowsOnScreen(state: TargetRangeState): readonly Arrow[] {
  return state.phase === "roundEnd" || state.phase === "over" ? [] : state.arrows;
}

function flyingArrow(arrow: Arrow, slot: PipSlot, nowMs: number): FlyingArrowPresentation {
  const from = bowPoint(slot, true);
  const p = Math.min(1, Math.max(0, (nowMs - arrow.atMs) / arrow.flightMs));
  const x = from.x + (arrow.x - from.x) * p;
  const y = from.y + (arrow.y - from.y) * p - arcPx * Math.sin(Math.PI * p);
  return {
    id: arrow.playerId,
    x: Math.round(x),
    y: Math.round(y),
    size: p < 1 / 3 ? 2 : p < 2 / 3 ? 1 : 0,
    facing: arrow.x >= from.x ? 1 : -1,
  };
}

function stuckArrow(
  arrow: Arrow,
  volley: number,
  nowMs: number,
  reducedMotion: boolean,
): StuckArrowPresentation {
  const sinceMs = nowMs - arrow.landsAtMs;
  const wobble =
    reducedMotion || sinceMs < -slackMs || sinceMs >= 2 * wobbleFrameMs - slackMs
      ? 0
      : sinceMs < wobbleFrameMs - slackMs
        ? 1
        : -1;
  return {
    id: arrow.playerId,
    x: Math.round(arrow.x) + wobble,
    y: Math.round(arrow.y),
    newest: arrow.volley === volley,
  };
}

function pointsTag(player: TargetRangePlayer, pop: number): PointsTagPresentation | null {
  const { result } = player;
  if (result === null) return null;
  if (typeof result === "number" && result > 0) {
    return {
      id: player.id,
      text: String(result),
      tone: result === bullseyePoints ? "bullseye" : "hit",
      pop,
    };
  }
  return { id: player.id, text: result === "late" ? "LATE" : "MISS", tone: "miss", pop };
}

function roundResults(state: TargetRangeState): RoundResultsPresentation {
  const firstVolley = volleyOf({ round: state.round, arrow: 1 });
  const rows = state.players.map((player, seat) => {
    const arrows = Array.from({ length: arrowsPerRound }, (_, index) => {
      const arrow = state.arrows.find(
        (candidate) => candidate.playerId === player.id && candidate.volley === firstVolley + index,
      );
      return arrow ? arrow.points : null;
    });
    return {
      seat,
      tens: player.tens,
      row: {
        id: player.id,
        name: player.name,
        arrows,
        roundPoints: arrows.reduce<number>((sum, points) => sum + (points ?? 0), 0),
        points: player.points,
      },
    };
  });
  return {
    title:
      state.phase === "over"
        ? "Final scores"
        : `Scores after round ${state.round} of ${roundCount}`,
    rows: rows
      .toSorted((a, b) => b.row.points - a.row.points || b.tens - a.tens || a.seat - b.seat)
      .map((entry) => entry.row),
  };
}

export function present(state: TargetRangeState, options: PresentOptions): Presentation {
  const { reducedMotion } = options;
  const { nowMs } = state;
  const slots = pipSlots(state.players.length);
  const rules = roundRules(state.round);
  const volley = volleyOf(state);
  const target = { ...targetPosition(state, options), radius: rules.radius };
  const wind = currentWind(state);
  const strength = Math.abs(wind);
  const slotOf = (id: string): PipSlot =>
    slots[state.players.findIndex((player) => player.id === id)] ?? (slots[0] as PipSlot);

  const seatOf = (id: string): number => state.players.findIndex((player) => player.id === id);
  // Older volleys first, then seat order, so shapes are placed in the same order every frame.
  const shown = arrowsOnScreen(state).toSorted(
    (a, b) => a.volley - b.volley || seatOf(a.playerId) - seatOf(b.playerId),
  );
  const landed = (arrow: Arrow) => arrow.landed || nowMs >= arrow.landsAtMs - slackMs;
  const inVolley = (arrow: Arrow) => arrow.volley === volley && state.phase !== "intro";

  const pips = state.players.map((player, index): PipPresentation => ({
    id: player.id,
    slot: slots[index] as PipSlot,
    left: player.left,
    expression: pipExpression(state, player),
    blink: blinking(state, index),
    bowRaised:
      (state.phase === "open" || state.phase === "landing" || state.phase === "reveal") &&
      state.arrows.some((arrow) => arrow.playerId === player.id && inVolley(arrow)),
  }));

  const crosshairs = [...(options.crosshairs ?? [])];

  const revealAgeMs = nowMs - state.phaseAtMs;
  const pop = reducedMotion ? 1 : Math.min(1, Math.max(0, revealAgeMs / motion.ui.ms));
  const tags =
    state.phase === "reveal" ? state.players.flatMap((player) => pointsTag(player, pop) ?? []) : [];
  const bullseye =
    state.phase === "reveal" &&
    revealAgeMs < revealMs &&
    state.players.some((player) => player.result === bullseyePoints);

  return {
    phase: state.phase,
    round: state.round,
    arrow: state.arrow,
    target,
    wind: {
      strength,
      direction: wind === 0 ? 0 : wind > 0 ? 1 : -1,
      frame: reducedMotion || strength === 0 ? 0 : Math.floor(nowMs / flagFrameMs) % 3,
      foot: flagFoot(target),
    },
    pips,
    crosshairs,
    flying: shown
      .filter((arrow) => !landed(arrow))
      .map((arrow) => flyingArrow(arrow, slotOf(arrow.playerId), nowMs)),
    stuck: shown
      .filter(landed)
      .map((arrow) =>
        stuckArrow(arrow, state.phase === "intro" ? 0 : volley, nowMs, reducedMotion),
      ),
    panel: panelText(state),
    clock:
      state.phase === "open" && state.openAtMs !== null
        ? Math.max(0, Math.ceil((state.openAtMs + volleyMs - nowMs - slackMs) / 1000))
        : null,
    tags,
    callout: bullseye
      ? { text: "BULLSEYE!", key: `bullseye:${volley}`, at: calloutAt(target) }
      : null,
    results: state.phase === "roundEnd" || state.phase === "over" ? roundResults(state) : null,
  };
}
