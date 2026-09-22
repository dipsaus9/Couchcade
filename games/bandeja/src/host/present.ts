import { matchSlots, otherSide, slotSpec, targetPoints, whiffErrorMs } from "../shared/index.ts";
import type { BandejaState, PointReason, Side, SlotName } from "../shared/index.ts";
import { floorSy, sx, sy } from "./layout.ts";

/**
 * Pure presentation for one frame (docs/games/bandeja.md, "TV scene"): turns `BandejaState` plus a
 * little extra context the scene alone can't reconstruct (`lastRallyShots`, kept the way Strike
 * Night's `rollCache` keeps the last live roll) into what `world.ts` and `overlays.ts` draw. Never
 * mutates, never reads the clock: everything is a function of `state.nowMs`.
 */

/** How long before an arrival the swing ring starts closing (TV scene, "Swing ring"). */
export const ringWindowMs = 280;

export interface BallPresentation {
  x: number;
  y: number;
  shadowX: number;
  shadowY: number;
}

export interface PipPresentation {
  /** The seated player's id, or `null` for an auto-returning/empty slot (rule 10). */
  id: string | null;
  slot: SlotName;
  side: Side;
  x: number;
  feetY: number;
  expression: "neutral" | "happy";
}

export interface RingPresentation {
  slot: SlotName;
  x: number;
  y: number;
  /** 3 at the window's start, shrinking to 1 at `arriveAt`. */
  scale: number;
  /** True once the ring has reached (or passed) `arriveAt`: Sunny instead of Chalk. */
  snap: boolean;
}

export type Callout = { key: string; text: string } | null;

export interface Presentation {
  ball: BallPresentation | null;
  pips: PipPresentation[];
  rings: RingPresentation[];
  panel: string;
  callout: Callout;
  /** Every seated player's own side's score, for the scoreboard chips (readability rule 7). */
  scoreByPlayer: Record<string, number>;
  /** The round counter chip: the rally's shot count while one is live, the point number otherwise. */
  counter: number;
}

const sideName: Record<Side, string> = { a: "Side A", b: "Side B" };

function panelText(state: BandejaState): string {
  switch (state.phase) {
    case "intro":
      return "Swing when the ring closes";
    case "serve":
    case "rally":
      return "Swing when the ring closes";
    case "pointEnd": {
      if (state.lastPoint === null) return "Swing when the ring closes";
      const over = state.scores.a >= targetPoints || state.scores.b >= targetPoints;
      if (over) return `${sideName[state.lastPoint.won]} wins the match`;
      return `${sideName[otherSide(state.serving)]} to serve`;
    }
    case "over": {
      const winner: Side = state.scores.a > state.scores.b ? "a" : "b";
      return `${sideName[winner]} won ${state.scores[winner]} - ${state.scores[otherSide(winner)]}`;
    }
  }
}

/** `reason` plus how short the rally was, into the callout the spec names (TV scene, "Callouts"). */
function calloutFor(
  reason: PointReason,
  lastRallyShots: number | null,
): { key: string; text: string } {
  if (reason === "net") return { key: "net", text: "NET!" };
  // A double bounce with almost no shots played is a clean drive nobody could reach; a longer
  // rally that happens to end on a bounce, or the shot-60 safety valve, is an ordinary point.
  if (reason === "double-bounce" && lastRallyShots !== null && lastRallyShots <= 2) {
    return { key: "winner", text: "WINNER!" };
  }
  return { key: "point", text: "POINT!" };
}

export interface PresentOptions {
  /** The rally's shot count just before it ended, or null before point 1 (Presentation's own
   * cache; `state.rally` is already null by `pointEnd`). */
  lastRallyShots: number | null;
}

export function present(state: BandejaState, options: PresentOptions): Presentation {
  const ball = state.ball
    ? {
        x: sx(state.ball.body.x),
        y: sy(state.ball.body.y, state.ball.z),
        shadowX: sx(state.ball.body.x),
        shadowY: floorSy(state.ball.body.y),
      }
    : null;

  const winningSide = state.lastPoint?.won ?? null;
  const pips: PipPresentation[] = matchSlots(state).map((slot) => {
    const position = state.positions[slot];
    const player = state.players.find((candidate) => candidate.slot === slot);
    const side = player?.side ?? slotSpec(slot).side;
    const happy = state.phase === "pointEnd" && winningSide === side;
    return {
      id: player?.left ? null : (player?.id ?? null),
      slot,
      side,
      x: position ? sx(position[0]) : sx(5),
      feetY: position ? floorSy(position[1]) : floorSy(10),
      expression: happy ? "happy" : "neutral",
    };
  });

  const rings: RingPresentation[] = [];
  if (state.ball !== null) {
    const { leg } = state.ball;
    for (const [slotName, arriveAt] of Object.entries(leg.arrivals) as [SlotName, number][]) {
      if (leg.timedOut.includes(slotName)) continue;
      const remaining = arriveAt - state.nowMs;
      if (remaining > ringWindowMs || remaining < -whiffErrorMs) continue;
      const position = state.positions[slotName];
      if (position === undefined) continue;
      const fraction = Math.min(1, Math.max(0, remaining / ringWindowMs));
      rings.push({
        slot: slotName,
        x: sx(position[0]),
        y: floorSy(position[1]),
        scale: 1 + 2 * fraction,
        snap: remaining <= 0,
      });
    }
  }

  const scoreByPlayer: Record<string, number> = {};
  for (const player of state.players) scoreByPlayer[player.id] = state.scores[player.side];

  const counter = state.rally !== null ? state.rally.shots : state.point;

  const callout: Callout =
    state.phase === "pointEnd" && state.lastPoint !== null
      ? calloutFor(state.lastPoint.reason, options.lastRallyShots)
      : state.phase === "over"
        ? { key: "match", text: "MATCH!" }
        : null;

  return {
    ball,
    pips,
    rings,
    panel: panelText(state),
    callout,
    scoreByPlayer,
    counter,
  };
}
