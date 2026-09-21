/**
 * The numbers from docs/games/putt-club.md. The TV scene and the phone controller (CC-13.3,
 * CC-13.4) read them from here too, so the rules and what players see never drift apart. Units are
 * metres, seconds, kilograms and degrees unless a name says radians.
 *
 * This file never imports `@couchcade/physics` itself (only `physics.ts` does): the phone
 * controller type-imports `input.ts`, which imports `maxTurns` from here, and
 * `game-controller-never-reaches-physics` (.dependency-cruiser.cjs) checks that nothing under
 * `src/controller/` reaches Planck through `shared/`, even transitively.
 */
import { maxInputAgeMs } from "@couchcade/game-sdk/contract";

/** 1 to 4 seated players ("At a glance"). Set directly on `defineGameMeta({ players })` in
 * src/meta.ts, so it isn't repeated here under another name. */
const maxTableSeats = 4;

/** Every match is the same 9 holes, played in order (rule 2). */
export const holeCount = 9;
/** A player who reaches this many strokes on a hole without holing out is picked up (rule 9). */
export const strokeCap = 6;
/** The most strokes in a match: 4 players x 9 holes x 6, the `turn` schema's cap. */
export const maxTurns = maxTableSeats * holeCount * strokeCap;

// --- Aim, then power (owner decision 1) -----------------------------------------------------

/** `line = bearing(ball -> cup) + yaw * AIM_SPAN_DEG`: `yaw` -1 to 1 covers +-75 degrees. */
export const AIM_SPAN_DEG = 75;
/** The swing's own `angle` is clamped to this before `PUSH_GAIN` turns it into a push. */
export const PUSH_ANGLE_CLAMP_DEG = 45;
/** Degrees of push per clamped degree of swing angle: +-1.8 degrees at the full +-45. */
export const PUSH_GAIN = 0.04;

/** Launch speed range: `PUTT_MIN_SPEED + PUTT_SPEED_RANGE * speed`, 0.6 to 5.0 m/s. */
export const PUTT_MIN_SPEED = 0.6;
export const PUTT_SPEED_RANGE = 4.4;

// --- The green, the ball and the cup ---------------------------------------------------------

/** Rolling friction: a constant per-step `Push`, not `floorFriction`'s exponential damping. */
export const ROLL_DECEL = 1.5;
/** Under this speed, or a step's deceleration would reverse it, the ball is set to a dead stop. */
export const STOP_SPEED = 0.05;
/** Inside `captureRadius` at or under this speed: holed. Above it: lips out. */
export const CAPTURE_SPEED = 1.2;
/** A lip-out's speed loss, once per pass across the cup. */
export const LIP_LOSS = 0.25;

export const ballId = "ball";
export const ballRadius = 0.0213;
export const ballDensity = 32.2;
export const ballFriction = 0.2;
export const ballRestitution = 0.5;
export const ballMassKg = ballDensity * Math.PI * ballRadius ** 2;

/** A hole's walls default here; a hole may override a wall's own `restitution`. */
export const kerbFriction = 0.2;
export const kerbRestitutionDefault = 0.5;

// --- Hazards and out of bounds (rule 8, owner decision 3) -----------------------------------

/** The point on the stroke's path this far before it left play, measured along the path. */
export const RESET_BACKOFF = 0.2;
/** A reset point must clear every wall and hazard edge by at least this much. */
export const RESET_CLEARANCE = 0.05;
/** Steps back along the path when the first candidate isn't clear. */
export const RESET_STEP = 0.05;
/** The ring buffer of a stroke's own in-play positions the reset walk-back reads. */
export const PATH_MAX_POINTS = 64;

// --- The hole data shape (CC-13.8 designs the actual nine holes) ----------------------------

/** A hole's `bounds` fits the TV's play area: at most this long (rule 2). */
export const HOLE_MAX_LENGTH_M = 10.8;
/** At most this wide (rule 2). */
export const HOLE_MAX_WIDTH_M = 7;
/** The tee and the cup must sit at least this far from any wall (rule 3). */
export const TEE_CUP_WALL_CLEARANCE_M = 0.1;
/** `captureRadius` is 0.05 (tight) to 0.10 (forgiving) metres (rule 4). */
export const CAPTURE_RADIUS_MIN_M = 0.05;
export const CAPTURE_RADIUS_MAX_M = 0.1;
/** The cup must clear every wall by at least `captureRadius + this much` (rule 4). */
export const CUP_WALL_CLEARANCE_EXTRA_M = 0.1;
/** No two consecutive wall points closer than this (rule 5), Planck's own linear slop. */
export const MIN_WALL_EDGE_LENGTH_M = 0.005;
/** A hole's `par` is one of these (rule 6). */
export const validPars: readonly number[] = [2, 3, 4];

// --- Turn flow and timings --------------------------------------------------------------------

/** `intro`: the clubhouse gate and hole 1 behind it. */
export const introMs = 3000;
/** `holeIntro`: the hole slides in, the flag plants, every ball lands on the tee mat. */
export const holeIntroMs = 3500;
/** Every turn's timer, from the moment it opens (rule 5). */
export const turnTimerMs = 15_000;
/** An away player's shortened timer (rule 6). */
export const awayTurnTimerMs = 5000;
/** The auto-putt fires this long after the deadline, the platform's late-input wait. */
export const autoPuttWaitMs = maxInputAgeMs;
/** An accepted input from an away player pushes the deadline to this long after it (rule 6). */
export const awayInputExtensionMs = 10_000;
/** A player whose last this many strokes were auto-putts is away (rule 6). */
export const awayAfterAutoPutts = 2;
/** The auto-putt is weighted to stop this fraction short of the cup (rule 5). */
export const autoPuttShortFraction = 0.2;

/** `rolling`: from the strike until the ball settles, at most this long (a backstop). */
export const rollingMaxMs = 8000;
/** `result`: the stroke count pops over the ball. */
export const resultMs = 900;
/** `result` with an `IN!`, `BIRDIE!` or `HOLE IN ONE!` callout. */
export const resultWithCalloutMs = 1800;
/** `holeEnd`: the scorecard overlay, holes left. */
export const holeEndMs = 3000;
/** `holeEnd` after hole 9, before the match ends. */
export const holeEndLastMs = 6000;
