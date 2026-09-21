/**
 * The hole data shape (docs/games/putt-club.md, "The hole data shape"). This file fixes only what
 * a hole *is*: the shape, and `validateHole`, the rule list CC-13.8's nine real holes must pass.
 * Designing those nine holes is CC-13.8's own job, not this story's — nothing here is course data.
 *
 * Plain data, no imports from `@couchcade/physics`: `shared/constants.ts` in Strike Night already
 * carries that rule, because the phone controller type-imports the input schema and
 * `game-controller-never-reaches-physics` in `.dependency-cruiser.cjs` checks that nothing under
 * `src/controller/` reaches Planck, even transitively through `shared/`.
 */
import {
  CAPTURE_RADIUS_MAX_M,
  CAPTURE_RADIUS_MIN_M,
  CUP_WALL_CLEARANCE_EXTRA_M,
  HOLE_MAX_LENGTH_M,
  HOLE_MAX_WIDTH_M,
  MIN_WALL_EDGE_LENGTH_M,
  TEE_CUP_WALL_CLEARANCE_M,
  validPars,
} from "./constants.ts";
import {
  distance,
  pointInBox,
  pointInCircle,
  pointToBoxEdgeDistance,
  pointToPolylineDistance,
} from "./geometry.ts";

/** A point on the green, in metres. */
export type Spot = readonly [x: number, y: number];

export interface HoleWall {
  /** At least two points. A closed `loop` is the hole's boundary; an open path is a baffle inside it. */
  readonly points: readonly Spot[];
  readonly loop: boolean;
  /** Bounciness, 0 to 1. Defaults to `kerbRestitutionDefault` (0.5). */
  readonly restitution?: number;
}

export interface HoleHazard {
  /** A pond or a drop. Both are out of play; the kind only picks the sprite and the sound. */
  readonly kind: "water" | "pit";
  /** Axis-aligned box, or a circle. */
  readonly shape:
    | { readonly box: readonly [min: Spot, max: Spot] }
    | { readonly circle: Spot; readonly radius: number };
}

export interface Hole {
  /** 1 to 9. */
  readonly id: number;
  /** Overlay text only, under 20 characters: "The Elbow". */
  readonly name: string;
  /** 2, 3 or 4. What a good player should need. */
  readonly par: number;
  /** Where every ball starts the hole. */
  readonly tee: Spot;
  readonly cup: Spot;
  /** Metres. 0.05 (tight) to 0.10 (forgiving). See the tolerance table in the spec. */
  readonly captureRadius: number;
  readonly walls: readonly HoleWall[];
  readonly hazards: readonly HoleHazard[];
  /** The playable box. A ball whose centre leaves it is out of bounds. Also the camera's frame. */
  readonly bounds: readonly [min: Spot, max: Spot];
}

/** True when `p` sits inside (or on the edge of) `hazard`'s shape. */
export function pointInHazard(hazard: HoleHazard, p: Spot): boolean {
  return "box" in hazard.shape
    ? pointInBox(p, hazard.shape.box[0], hazard.shape.box[1])
    : pointInCircle(p, hazard.shape.circle, hazard.shape.radius);
}

/** Distance from `p` to `hazard`'s own edge (0 when `p` sits exactly on it). */
export function hazardEdgeDistance(hazard: HoleHazard, p: Spot): number {
  if ("box" in hazard.shape)
    return pointToBoxEdgeDistance(p, hazard.shape.box[0], hazard.shape.box[1]);
  const toCentre = distance(p, hazard.shape.circle);
  return Math.abs(toCentre - hazard.shape.radius);
}

/** `p` is in play: inside `hole.bounds` and outside every hazard. */
export function inPlay(hole: Hole, p: Spot): boolean {
  return (
    pointInBox(p, hole.bounds[0], hole.bounds[1]) && !hole.hazards.some((h) => pointInHazard(h, p))
  );
}

/** The closest any wall or hazard edge comes to `p`. `Infinity` with neither. */
export function clearanceAt(hole: Hole, p: Spot): number {
  let min = Number.POSITIVE_INFINITY;
  for (const wall of hole.walls)
    min = Math.min(min, pointToPolylineDistance(wall.points, wall.loop, p));
  for (const hazard of hole.hazards) min = Math.min(min, hazardEdgeDistance(hazard, p));
  return min;
}

/**
 * The static problems with `hole`: everything docs/games/putt-club.md, "The hole data shape"
 * requires of a hole's geometry (rules 2 to 6). An empty list means the shape is valid.
 *
 * Rule 1 (flat, no slope) has no runtime check: the `Hole` type has no slope field, so a
 * TypeScript literal satisfies it by construction. Rule 7 (completable) isn't a shape property at
 * all — it's CC-13.8's own per-hole test, replaying a scripted shot sequence through this story's
 * `startStroke`/`stepStroke` and asserting a hole-out inside `strokeCap` strokes.
 */
export function validateHole(hole: Hole): string[] {
  const problems: string[] = [];
  const [min, max] = hole.bounds;

  // Rule 2: fits the screen.
  const width = max[0] - min[0];
  const height = max[1] - min[1];
  if (!(width > 0 && width <= HOLE_MAX_LENGTH_M)) {
    problems.push(
      `bounds is ${width} m long, must be more than 0 and at most ${HOLE_MAX_LENGTH_M} m`,
    );
  }
  if (!(height > 0 && height <= HOLE_MAX_WIDTH_M)) {
    problems.push(
      `bounds is ${height} m across, must be more than 0 and at most ${HOLE_MAX_WIDTH_M} m`,
    );
  }

  // Rule 3: the tee and the cup are in play and clear of every wall.
  for (const [label, spot] of [
    ["tee", hole.tee],
    ["cup", hole.cup],
  ] as const) {
    if (!inPlay(hole, spot)) problems.push(`${label} at [${spot}] is not in play`);
    const wallClearance =
      hole.walls.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(
            ...hole.walls.map((wall) => pointToPolylineDistance(wall.points, wall.loop, spot)),
          );
    if (wallClearance < TEE_CUP_WALL_CLEARANCE_M) {
      problems.push(
        `${label} at [${spot}] is ${wallClearance} m from a wall, needs at least ${TEE_CUP_WALL_CLEARANCE_M} m`,
      );
    }
  }

  // Rule 4: the cup is reachable.
  if (!(hole.captureRadius >= CAPTURE_RADIUS_MIN_M && hole.captureRadius <= CAPTURE_RADIUS_MAX_M)) {
    problems.push(
      `captureRadius ${hole.captureRadius} must be ${CAPTURE_RADIUS_MIN_M} to ${CAPTURE_RADIUS_MAX_M} m`,
    );
  }
  const cupWallClearance =
    hole.walls.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(
          ...hole.walls.map((wall) => pointToPolylineDistance(wall.points, wall.loop, hole.cup)),
        );
  const cupClearanceNeeded = hole.captureRadius + CUP_WALL_CLEARANCE_EXTRA_M;
  if (cupWallClearance < cupClearanceNeeded) {
    problems.push(
      `cup is ${cupWallClearance} m from a wall, needs at least ${cupClearanceNeeded} m`,
    );
  }

  // Rule 5: walls are legal Planck chains.
  for (const [index, wall] of hole.walls.entries()) {
    const minPoints = wall.loop ? 3 : 2;
    if (wall.points.length < minPoints) {
      problems.push(
        `walls[${index}] needs at least ${minPoints} points, has ${wall.points.length}`,
      );
      continue;
    }
    const edges = wall.loop ? wall.points.length : wall.points.length - 1;
    for (let i = 0; i < edges; i++) {
      const a = wall.points[i] as Spot;
      const b = wall.points[(i + 1) % wall.points.length] as Spot;
      if (distance(a, b) <= MIN_WALL_EDGE_LENGTH_M) {
        problems.push(
          `walls[${index}] points ${i} and ${(i + 1) % wall.points.length} are too close`,
        );
      }
    }
  }

  // Rule 6: par is 2, 3 or 4.
  if (!validPars.includes(hole.par)) {
    problems.push(`par ${hole.par} must be one of ${validPars.join(", ")}`);
  }

  return problems;
}
