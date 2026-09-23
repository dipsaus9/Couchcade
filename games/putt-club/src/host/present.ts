import type { Hex, PlayerShape } from "@couchcade/theme";
import { players as seatPalette } from "@couchcade/theme";
import type { WorldPipFace } from "@couchcade/stage";
import { AIM_SPAN_DEG, bearingDeg, course, findPlayer } from "../shared/index.ts";
import type { Hole, PuttClubPlayer, PuttClubState, Spot } from "../shared/index.ts";
import { cupRadiusPx, projectionFor, stripeSpacingPx, waitingSpot } from "./layout.ts";
import type { Projection } from "./layout.ts";

/**
 * Pure presentation for one frame (docs/games/putt-club.md, "TV scene"): turns `PuttClubState`
 * plus the little the scene alone can't reconstruct (the putter's live aim yaw, from its own
 * stateful playback) into what `world.ts` and the overlays draw. Never mutates, never reads the
 * clock: everything is a function of `state` and the given options.
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface KerbPresentation {
  points: ScreenPoint[];
  loop: boolean;
}

export type HazardPresentation =
  | { kind: "water" | "pit"; shape: "box"; x: number; y: number; width: number; height: number }
  | {
      kind: "water" | "pit";
      shape: "circle";
      x: number;
      y: number;
      radiusX: number;
      radiusY: number;
    };

export interface BallPresentation {
  playerId: string;
  x: number;
  y: number;
  shape: PlayerShape;
  color: Hex;
  /** Not the current putter's own ball (TV scene, "Other balls"). */
  ghost: boolean;
}

export interface PipPresentation {
  playerId: string;
  x: number;
  feetY: number;
  expression: WorldPipFace["expression"];
  role: "putter" | "waiting";
}

export interface AimLinePresentation {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  locked: boolean;
}

/** The penalty/cap chip over a ball (TV scene, "Callouts": "a small Signal '+1' or '6' chip"). */
export interface ChipPresentation {
  text: string;
  worldX: number;
  worldY: number;
}

export type Callout = { key: string; text: string } | null;

export interface Presentation {
  carpet: ScreenPoint[];
  /** Alternating mown-colour bands over the carpet, already screen rects (TV scene, "Carpet"). */
  stripes: { x: number; y: number; width: number; height: number }[];
  kerbs: KerbPresentation[];
  hazards: HazardPresentation[];
  cup: { x: number; y: number; radius: number };
  flag: ScreenPoint;
  balls: BallPresentation[];
  pips: PipPresentation[];
  aimLine: AimLinePresentation | null;
  chip: ChipPresentation | null;
  panel: string;
  callout: Callout;
  scoreByPlayer: Record<string, number>;
  round: { current: number; total: number };
}

export interface PresentOptions {
  /** The putter's current aim yaw (−1 to 1), from the scene's own aim playback. `null` when
   * there's nothing to show yet. */
  aimYaw: number | null;
  /** Always `9` (`holeCount`), passed in so this file never needs to import it just for a type. */
  holeCount: number;
}

/** The hole's outer boundary: the first closed wall loop, or `bounds` itself with none. */
function boundaryOf(hole: Hole): readonly Spot[] {
  const loop = hole.walls.find((wall) => wall.loop);
  if (loop) return loop.points;
  const [min, max] = hole.bounds;
  return [min, [max[0], min[1]], max, [min[0], max[1]]];
}

function carpetOf(hole: Hole, projection: Projection): ScreenPoint[] {
  return boundaryOf(hole).map((spot) => projection.point(spot));
}

/** Alternating mown bands, 16 px apart, running the hole's whole width (TV scene, "Carpet"). */
function stripesOf(
  hole: Hole,
  projection: Projection,
): { x: number; y: number; width: number; height: number }[] {
  const [min, max] = hole.bounds;
  const stepM = stripeSpacingPx / (projection.sx(min[0] + 1) - projection.sx(min[0]));
  const top = projection.sy(min[1]);
  const bottom = projection.sy(max[1]);
  const stripes: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0, x = min[0]; x < max[0]; i++, x += stepM) {
    if (i % 2 === 0) continue;
    const x1 = Math.min(x + stepM, max[0]);
    const left = projection.sx(x);
    const right = projection.sx(x1);
    stripes.push({ x: left, y: top, width: right - left, height: bottom - top });
  }
  return stripes;
}

function hazardsOf(hole: Hole, projection: Projection): HazardPresentation[] {
  return hole.hazards.map((hazard) => {
    if ("box" in hazard.shape) {
      const [min, max] = hazard.shape.box;
      const p0 = projection.point(min);
      const p1 = projection.point(max);
      return {
        kind: hazard.kind,
        shape: "box" as const,
        x: Math.min(p0.x, p1.x),
        y: Math.min(p0.y, p1.y),
        width: Math.abs(p1.x - p0.x),
        height: Math.abs(p1.y - p0.y),
      };
    }
    const centre = projection.point(hazard.shape.circle);
    const edge = projection.point([
      hazard.shape.circle[0] + hazard.shape.radius,
      hazard.shape.circle[1] + hazard.shape.radius,
    ]);
    return {
      kind: hazard.kind,
      shape: "circle" as const,
      x: centre.x,
      y: centre.y,
      radiusX: Math.abs(edge.x - centre.x),
      radiusY: Math.abs(edge.y - centre.y),
    };
  });
}

function kerbsOf(hole: Hole, projection: Projection): KerbPresentation[] {
  return hole.walls.map((wall) => ({
    points: wall.points.map((spot) => projection.point(spot)),
    loop: wall.loop,
  }));
}

function seatOf(player: PuttClubPlayer): (typeof seatPalette)[number] {
  return seatPalette[player.seat % seatPalette.length] as (typeof seatPalette)[number];
}

/** Every live player's ball, ghosted for everyone but the current putter (TV scene, "Ball", "Other
 * balls", readability rule 4). A holed ball has left the world, so it stops showing at all. */
function ballsOf(state: PuttClubState, projection: Projection): BallPresentation[] {
  const balls: BallPresentation[] = [];
  for (const player of state.players) {
    if (player.left) continue;
    if (player.doneHole && player.last?.result === "holed") continue;
    const isPutter = player.id === state.putterId;
    const spot: Spot =
      isPutter && state.phase === "rolling" && state.activeStroke
        ? [state.activeStroke.ball.x, state.activeStroke.ball.y]
        : player.ball;
    const { x, y } = projection.point(spot);
    const seat = seatOf(player);
    balls.push({
      playerId: player.id,
      x,
      y,
      shape: seat.shape,
      color: seat.color,
      ghost: !isPutter,
    });
  }
  return balls;
}

/** The putter beside their ball, everyone else waiting on the path, lower-left (TV scene,
 * "Players"). Expression only differs for the putter, once their stroke has a result. */
function pipsOf(state: PuttClubState, projection: Projection): PipPresentation[] {
  const pips: PipPresentation[] = [];
  const waiting = state.players
    .filter((player) => !player.left && player.id !== state.putterId)
    .toSorted((a, b) => a.seat - b.seat);
  waiting.forEach((player, index) => {
    pips.push({
      playerId: player.id,
      x: waitingSpot.x,
      feetY: waitingSpot.bottomY - index * waitingSpot.stepY,
      expression: "neutral",
      role: "waiting",
    });
  });

  const putter = findPlayer(state, state.putterId);
  if (putter !== undefined && !putter.left) {
    const isRolling = state.phase === "rolling" && state.activeStroke;
    const spot: Spot = isRolling
      ? [state.activeStroke!.ball.x, state.activeStroke!.ball.y]
      : putter.ball;
    const { x, y } = projection.point(spot);
    pips.push({
      playerId: putter.id,
      x: x - 10,
      feetY: y,
      expression: expressionOf(state, putter),
      role: "putter",
    });
  }
  return pips;
}

function expressionOf(state: PuttClubState, putter: PuttClubPlayer): WorldPipFace["expression"] {
  if (state.phase !== "result" || putter.last === null) return "neutral";
  if (putter.last.result === "penalty") return "surprised";
  if (putter.last.result === "holed") {
    const par = course[state.hole - 1]?.par ?? Number.POSITIVE_INFINITY;
    return putter.last.strokes <= par ? "happy" : "neutral";
  }
  return "neutral";
}

/** The dashed aim line, `turn` only, the putter only (TV scene, "Aim line"). Direction only —
 * never the predicted path. */
function aimLineOf(
  state: PuttClubState,
  hole: Hole,
  projection: Projection,
  aimYaw: number | null,
): AimLinePresentation | null {
  if (state.phase !== "turn" || aimYaw === null) return null;
  const putter = findPlayer(state, state.putterId);
  if (putter === undefined) return null;
  const lineDeg = bearingDeg(putter.ball, hole.cup) + aimYaw * AIM_SPAN_DEG;
  const rad = (lineDeg * Math.PI) / 180;
  const end: Spot = [putter.ball[0] + 1.5 * Math.cos(rad), putter.ball[1] + 1.5 * Math.sin(rad)];
  const p0 = projection.point(putter.ball);
  const p1 = projection.point(end);
  return { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, locked: state.locked };
}

/** `worldX`/`worldY` are world *pixels* (already projected), not hole-local metres: the scene
 * converts them with `worldToOverlay`, never metres directly. */
function chipOf(state: PuttClubState, projection: Projection): ChipPresentation | null {
  if (state.phase !== "result") return null;
  const putter = findPlayer(state, state.putterId);
  if (putter === undefined || putter.last === null) return null;
  const { x, y } = projection.point(putter.ball);
  if (putter.last.result === "penalty") return { text: "+1", worldX: x, worldY: y };
  if (putter.last.result === "capped")
    return { text: String(putter.last.strokes), worldX: x, worldY: y };
  return null;
}

function calloutOf(state: PuttClubState, hole: Hole): Callout {
  if (state.phase === "over") return { key: "match", text: "MATCH!" };
  if (state.phase !== "result") return null;
  const putter = findPlayer(state, state.putterId);
  if (putter === undefined || putter.last === null || putter.last.result !== "holed") return null;
  if (putter.last.strokes === 1) return { key: "ace", text: "HOLE IN ONE!" };
  if (putter.last.strokes < hole.par) return { key: "birdie", text: "BIRDIE!" };
  return { key: "in", text: "IN!" };
}

function panelText(state: PuttClubState, hole: Hole): string {
  const putter = findPlayer(state, state.putterId);
  switch (state.phase) {
    case "intro":
      return "Putt Club";
    case "holeIntro":
      return `${hole.name} · Par ${hole.par}`;
    case "turn":
      return putter ? `${putter.name} to putt` : "";
    case "rolling":
      return putter ? `${putter.name}'s ball is rolling` : "";
    case "result": {
      if (putter === undefined || putter.last === null) return "";
      switch (putter.last.result) {
        case "holed":
          return `${putter.name} holed it in ${putter.last.strokes}`;
        case "penalty":
          return `${putter.name} took a penalty stroke`;
        case "capped":
          return `${putter.name} picked up`;
        default:
          return `${putter.name} to putt again`;
      }
    }
    case "holeEnd":
      return "Scorecard";
    case "over":
      return "Match complete";
  }
}

export function present(state: PuttClubState, options: PresentOptions): Presentation {
  const hole = course[state.hole - 1] as Hole;
  const projection = projectionFor(hole);
  const cupCentre = projection.point(hole.cup);
  const flagTop = projection.point(hole.cup);

  const scoreByPlayer: Record<string, number> = {};
  for (const player of state.players) scoreByPlayer[player.id] = player.total;

  return {
    carpet: carpetOf(hole, projection),
    stripes: stripesOf(hole, projection),
    kerbs: kerbsOf(hole, projection),
    hazards: hazardsOf(hole, projection),
    cup: { x: cupCentre.x, y: cupCentre.y, radius: cupRadiusPx(hole.captureRadius) },
    flag: flagTop,
    balls: ballsOf(state, projection),
    pips: pipsOf(state, projection),
    aimLine: aimLineOf(state, hole, projection, options.aimYaw),
    chip: chipOf(state, projection),
    panel: panelText(state, hole),
    callout: calloutOf(state, hole),
    scoreByPlayer,
    round: { current: state.hole, total: options.holeCount },
  };
}
