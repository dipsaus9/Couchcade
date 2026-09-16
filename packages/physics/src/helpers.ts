import { STEP_SECONDS } from "./constants.ts";
import type { CircleBodySpec, Point, WallSpec } from "./types.ts";

/** Planck's linear slop: wall points closer together than this make a broken edge. */
const MIN_EDGE_LENGTH = 0.005;

export interface CircleBodyOptions {
  /** Metres. */
  radius: number;
  /** Kilograms per square metre. Default 1. */
  density?: number;
  /** Contact friction. Default 0.2. */
  friction?: number;
  /** Bounciness, 0 to 1. Default 0. */
  restitution?: number;
  /** Linear damping per second, the floor friction of a top-down game. Default 0. */
  damping?: number;
  /** Angular damping per second. Defaults to `damping`. */
  angularDamping?: number;
  /** Continuous collision against other moving bodies (a fast ball into pins). Default false. */
  bullet?: boolean;
}

export interface WallOptions {
  /** Names the wall in step contacts. Defaults to `wall:<index in spec.walls>`. */
  id?: string;
  /** Contact friction. Default 0.2. */
  friction?: number;
  /** Bounciness, 0 to 1. Default 0. */
  restitution?: number;
}

/** A dynamic circle: a ball, a puck, a bowling pin seen from above, a shell. */
export function circleBody(options: CircleBodyOptions): CircleBodySpec {
  const damping = options.damping ?? 0;
  const spec: CircleBodySpec = {
    shape: "circle",
    radius: options.radius,
    density: options.density ?? 1,
    friction: options.friction ?? 0.2,
    restitution: options.restitution ?? 0,
    linearDamping: damping,
    angularDamping: options.angularDamping ?? damping,
    bullet: options.bullet ?? false,
  };
  requirePositive("radius", spec.radius);
  requirePositive("density", spec.density);
  requireMaterial(spec.friction, spec.restitution);
  requireNonNegative("damping", spec.linearDamping);
  requireNonNegative("angularDamping", spec.angularDamping);
  return spec;
}

/** One straight static wall from `from` to `to`. */
export function wallSegment(from: Point, to: Point, options: WallOptions = {}): WallSpec {
  return wall([from, to], false, options);
}

/** An open polyline of static walls: a course edge or a hill line. At least 2 points. */
export function wallPath(points: readonly Point[], options: WallOptions = {}): WallSpec {
  return wall(points, false, options);
}

/**
 * A closed loop of static walls: an arena, a lane or a putting green. At least 3 points; the
 * last point connects back to the first, so don't repeat it. Bodies collide with the edges from
 * either side.
 */
export function wallLoop(points: readonly Point[], options: WallOptions = {}): WallSpec {
  return wall(points, true, options);
}

/**
 * Floor friction for a top-down game, as the linear damping that halves a sliding body's speed
 * every `halfLifeMs` milliseconds (`Infinity` gives no friction). Pass the result as `damping` to `circleBody`.
 *
 * A top-down floor isn't a Planck contact, so rolling and sliding friction are damping on the
 * body (session-flow.md, physics rule 5). Planck damps once per step by `1 / (1 + h * damping)`,
 * so this solves `(1 + h * damping)^(-halfLifeMs / STEP_MS) = 0.5` for `damping`.
 */
export function floorFriction(halfLifeMs: number): number {
  if (halfLifeMs === Number.POSITIVE_INFINITY) return 0;
  requirePositive("halfLifeMs", halfLifeMs);
  return (2 ** ((STEP_SECONDS * 1000) / halfLifeMs) - 1) / STEP_SECONDS;
}

function wall(points: readonly Point[], loop: boolean, options: WallOptions): WallSpec {
  const minPoints = loop ? 3 : 2;
  if (points.length < minPoints) {
    throw new RangeError(`A wall ${loop ? "loop" : "path"} needs at least ${minPoints} points`);
  }
  const copy = points.map(([x, y]): Point => {
    requireFinite("wall point", x);
    requireFinite("wall point", y);
    return [x, y];
  });
  const edges = loop ? copy.length : copy.length - 1;
  for (let i = 0; i < edges; i++) {
    const [ax, ay] = copy[i] as Point;
    const [bx, by] = copy[(i + 1) % copy.length] as Point;
    if (Math.hypot(bx - ax, by - ay) <= MIN_EDGE_LENGTH) {
      throw new RangeError(
        `Wall points ${i} and ${(i + 1) % copy.length} are closer than ${MIN_EDGE_LENGTH} m`,
      );
    }
  }
  const spec: WallSpec = {
    points: copy,
    loop,
    friction: options.friction ?? 0.2,
    restitution: options.restitution ?? 0,
  };
  if (options.id !== undefined) spec.id = options.id;
  requireMaterial(spec.friction, spec.restitution);
  return spec;
}

function requireMaterial(friction: number, restitution: number): void {
  requireNonNegative("friction", friction);
  requireNonNegative("restitution", restitution);
}

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
}

function requireNonNegative(name: string, value: number): void {
  requireFinite(name, value);
  if (value < 0) throw new RangeError(`${name} must be 0 or more, got ${value}`);
}

function requirePositive(name: string, value: number): void {
  requireFinite(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be more than 0, got ${value}`);
  }
}
