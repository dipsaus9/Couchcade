/**
 * Where things sit on the TV, in the 480×270 world (docs/games/strike-night.md, "TV scene").
 * Two projections turn a lane position (metres, `shared/constants.ts`'s coordinate system) into
 * whole world pixels: the approach shot (behind the foul line, for `intro`, `lineup` and the
 * start of `rolling`) and the pin shot (the deck, cut to when the ball passes `y = 16`, until
 * `result` ends). Every formula here is copied verbatim from the spec's "TV scene" table.
 */
import { headPinY, laneCenterX } from "../shared/constants.ts";

export interface ScreenPoint {
  x: number;
  y: number;
}

/** A lane position in metres, `shared/constants.ts`'s coordinate system. */
export interface LanePoint {
  x: number;
  y: number;
}

/** The world `y` the TV cuts from the approach shot to the pin shot, until `result` ends. */
export const pinShotFromY = 16;

// --- Approach shot: behind the foul line, in perspective -----------------------------------

/** Metres to world px at `y`, in the approach shot. */
export function approachScale(y: number): number {
  return 925 / (y + 6.1);
}

/** A lane position in the approach shot. The foul line (`y = 0`) sits at `sy = 240`, the head
 * pin (`y = headPinY`) at `sy = 96` (checked against the spec's own numbers). */
export function toApproach(point: LanePoint): ScreenPoint {
  const s = approachScale(point.y);
  return {
    x: 240 + (point.x - laneCenterX) * s,
    y: 48 + 1171 / (point.y + 6.1),
  };
}

/** Seven Ink target arrows, 4.57 m (15 ft) down the lane, evenly spread across it. */
export const targetArrowsY = 4.57;
export const targetArrowCount = 7;

// --- Pin shot: the deck, from above and behind ----------------------------------------------

/** Metres to world px across the lane, in the pin shot. */
export function pinShotScale(y: number): number {
  return 1832 / (y - 7.56);
}

/** A lane position in the pin shot. The head pin sits at `(240, 170)`, the back row at `y = 134`,
 * a flat depth scale (not perspective) on `y`, unlike the approach shot. */
export function toPinShot(point: LanePoint): ScreenPoint {
  const s = pinShotScale(point.y);
  return {
    x: 240 + (point.x - laneCenterX) * s,
    y: 170 - (point.y - headPinY) * 45,
  };
}

// --- Ball -------------------------------------------------------------------------------------

/** The ball's real diameter in metres (`2 * ballRadius`, `shared/constants.ts`). */
export const ballDiameterM = 0.216;

/** The ball's on-screen diameter in the approach shot: never bigger than the 16×16 bowler. */
export function approachBallSize(y: number): number {
  return Math.min(16, ballDiameterM * approachScale(y));
}

/** The ball's on-screen diameter in the pin shot: the real size ratio against 20 px pins. */
export const pinShotBallSize = 32;

// --- Pins ---------------------------------------------------------------------------------------

/** A pin's on-screen size in the approach shot: an 8×16 frame, whatever its distance. */
export const approachPinSize = { width: 8, height: 16 } as const;
/** A pin's on-screen size in the pin shot: a 24×40 frame. */
export const pinShotPinSize = { width: 24, height: 40 } as const;

// --- The lane, gutters and kickbacks, for the approach shot's static scenery ----------------

/** The lane's edges at the foul line, in the approach shot (checked: 160 px wide, matches the
 * spec's own "the lane 160 px wide" at the foul line). */
export const foulLineY = toApproach({ x: 0, y: 0 }).y;

/** The ceiling band's height, above the lane's vanishing point. */
export const ceilingHeight = 30;

// --- The bowler's stand, and the bench for everyone else ------------------------------------

/**
 * Where the bowler stands, from their last lineup position (docs/games/strike-night.md,
 * "Throwing", "Start"): `x = -1..1` maps to `0.527 ± 0.41`, the same spot the ball starts a roll
 * from, at `y = 0.3`, just up the approach from the foul line.
 */
export function bowlerStandPoint(x: number): LanePoint {
  return { x: laneCenterX + x * 0.41, y: 0.3 };
}

/** Where the bench sits, in world px: lower-left corner of the approach shot, off the lane
 * itself, so it's a fixed screen spot rather than a lane position to project. Up to 3 seats
 * (Strike Night's 4-player cap, minus the bowler). */
export const benchArea = { x: 30, y: 236, seatGapPx: 22 } as const;

/** The `n`-th bench seat's screen position, the next bowler nearest the lane. */
export function benchSlot(n: number): ScreenPoint {
  return { x: benchArea.x + n * benchArea.seatGapPx, y: benchArea.y };
}
