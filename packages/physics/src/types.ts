/**
 * Plain-data types for `@couchcade/physics`. Everything here is JSON: game state stores
 * `BodyState` arrays, and `WorldSpec` is a game constant built from the game's own data.
 *
 * Units are metres, seconds, kilograms, newtons and radians. 1 metre is 16 world pixels
 * (`PIXELS_PER_METRE`). Scenes convert; rules never use pixels.
 */

/** A point in metres. */
export type Point = [x: number, y: number];

/** Where a dynamic body is and how it moves. This is the only physics data in `TState`. */
export interface BodyState {
  id: string;
  /** Centre, in metres. */
  x: number;
  y: number;
  /** Linear velocity, in metres per second. */
  vx: number;
  vy: number;
  /** Angle, in radians. */
  a: number;
  /** Angular velocity, in radians per second. */
  w: number;
}

/** A force applied to one body's centre for a single step, in newtons. */
export interface Push {
  id: string;
  fx: number;
  fy: number;
}

/** A dynamic circle. Build one with `circleBody`. */
export interface CircleBodySpec {
  shape: "circle";
  radius: number;
  /** Kilograms per square metre. Mass is `density * PI * radius^2`. */
  density: number;
  /** Contact friction against other bodies and walls, usually 0 to 1. */
  friction: number;
  /** Bounciness of contacts, 0 (dead) to 1 (elastic). */
  restitution: number;
  /** Linear damping per second. The friction of a top-down floor, see `floorFriction`. */
  linearDamping: number;
  /** Angular damping per second. */
  angularDamping: number;
  /** Continuous collision against other dynamic bodies, for fast balls that must not tunnel. */
  bullet: boolean;
}

/** Shape, material and damping of a dynamic body. Only circles so far. */
export type BodySpec = CircleBodySpec;

/**
 * Static geometry: an open polyline or a closed loop of edges. Build one with `wallSegment`,
 * `wallPath` or `wallLoop`.
 */
export interface WallSpec {
  /** Names the wall in step contacts. Defaults to `wall:<index in spec.walls>`. */
  id?: string;
  points: Point[];
  /** Closes the polyline back to its first point. */
  loop: boolean;
  friction: number;
  restitution: number;
}

/** Everything about a world that isn't state: gravity, walls, and body specs per body id. */
export interface WorldSpec {
  /** Metres per second squared. Top-down games use `[0, 0]`. */
  gravity: Point;
  walls: WallSpec[];
  bodies: Record<string, BodySpec>;
}

/** What one step returns. */
export interface StepResult {
  /** The bodies after the step, in the same order as the input. */
  bodies: BodyState[];
  /**
   * Pairs of ids (bodies or walls) whose shapes touched during the step. Each pair is sorted and
   * the list is sorted, so the same step always gives the same list.
   */
  contacts: Array<[string, string]>;
}
