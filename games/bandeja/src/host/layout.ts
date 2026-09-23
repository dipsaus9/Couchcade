import {
  cornerGlassMaxY,
  cornerGlassMinY,
  courtMaxX,
  courtMaxY,
  courtMinX,
  netY,
} from "../shared/index.ts";

/**
 * The court projection (docs/games/bandeja.md, "TV scene", "Projection"): orthographic with a
 * squashed depth, so `x` maps to screen `x` at one constant scale whatever the depth (there is no
 * perspective narrowing: `sx` never reads `y`), `y` maps to screen depth and `z` lifts a shot off
 * its shadow. The whole court is therefore a plain axis-aligned rectangle on screen, not a
 * trapezoid.
 */
export const xScale = 40;
/** Screen x at court x = 5, the centre line. */
export const xOrigin = 240;

/**
 * Depth scale and the near/far edges (finding 11, "Near-edge clear space"). The spec's own numbers
 * (9.2 px/m, near edge `sy` 236, far edge 52) leave only `236..270` -- 34 world px -- for the
 * bottom panel, reasoning from the world's raw bottom edge. But the panel actually built here
 * (`InstructionPanel`, the same `instructionPanelRect` Quick Draw, Target Range and Strike Night
 * all use) is anchored to the TV safe area, not the world's raw edge: it starts at world y 218
 * (`safeArea.bottom - metrics.depth - roomCodeMetrics.height`, converted to world px), 18 px
 * *inside* the spec's own near edge. Checked at 1080p per finding 11: the depth scale is
 * compressed from 9.2 to 8 px/m and the near edge raised from 236 to 208, clearing the panel by 10
 * world px, and the far edge lands at 48, clearing the scoreboard's ~36 px bottom by 12. `z` keeps
 * its own 14 px/m scale unchanged, so the "a lob floats about 20 px above its shadow" readability
 * finding still holds exactly as written.
 */
export const yScale = 8;
export const zScale = 14;
/** Screen y at court y = 0 (side A's own back wall, nearest the couch, never drawn). */
export const nearEdgeSy = 208;
/** Screen y at court y = 20 (side B's own back wall, the far glass). */
export const farEdgeSy = nearEdgeSy - yScale * courtMaxY;

/** A court plan position to screen x. */
export function sx(x: number): number {
  return xOrigin + (x - 5) * xScale;
}

/** A court plan position and height to screen y: higher `z` lifts the sprite up the screen. */
export function sy(y: number, z = 0): number {
  return nearEdgeSy - y * yScale - z * zScale;
}

/** Where a court position's shadow sits, always on the floor. */
export function floorSy(y: number): number {
  return sy(y, 0);
}

/** The left and right side walls' screen x span, 12 px bands just outside the court lines. */
export const sideWall = {
  leftOuter: sx(courtMinX) - 12,
  leftInner: sx(courtMinX),
  rightInner: sx(courtMaxX),
  rightOuter: sx(courtMaxX) + 12,
} as const;

/** The far glass band's height above the far edge. */
export const farGlassHeight = 22;

/** The net's screen y (its centre) and drawn band height. */
export const netSy = sy(netY);
export const netBandHeight = 12;

/** The corner glass / side mesh split, in screen y, on each side wall. */
export const sideWallBands = {
  cornerNearTop: nearEdgeSy,
  cornerNearBottom: sy(cornerGlassMaxY),
  meshTop: sy(cornerGlassMaxY),
  meshBottom: sy(cornerGlassMinY),
  cornerFarTop: sy(cornerGlassMinY),
  cornerFarBottom: farEdgeSy,
} as const;
