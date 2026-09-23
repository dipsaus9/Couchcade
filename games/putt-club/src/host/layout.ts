import type { Hex } from "@couchcade/theme";
import type { Hole, Spot } from "../shared/index.ts";

/**
 * The green's projection (docs/games/putt-club.md, "TV scene", "Projection" and "Play area"): a
 * plan view squashed to 70%, `sx = 24 + padX + (x − bounds.min.x) × 40`,
 * `sy = 38 + padY + (y − bounds.min.y) × 28`. `padX`/`padY` centre a smaller hole in the play
 * area and are whole pixels, worked out once per hole, so the pixel art never lands on a half
 * pixel. Every hole in CC-13.8's course fits this box (`hole.ts` rule 2: at most 10.8 m by 7 m),
 * so this projection never needs to know which hole it is drawing beyond its own `bounds`.
 */

/** Top-left of the play area, in world px. */
export const PLAY_X0 = 24;
export const PLAY_Y0 = 38;
/** The play area's own size, in world px: 10.8 m by 7.07 m at this scale. */
export const PLAY_WIDTH = 432;
export const PLAY_HEIGHT = 198;

/** World px per metre, along the hole (x) and across it (y, squashed to 70%). */
export const SCALE_X = 40;
export const SCALE_Y = 28;

export interface Projection {
  /** A hole-local x (metres) to world px. */
  sx(x: number): number;
  /** A hole-local y (metres) to world px. */
  sy(y: number): number;
  /** A hole-local spot to a world px point. */
  point(spot: Spot): { x: number; y: number };
}

/** A whole-pixel projection for `hole`, centred in the play area (never a half pixel). */
export function projectionFor(hole: Hole): Projection {
  const [min, max] = hole.bounds;
  const widthPx = (max[0] - min[0]) * SCALE_X;
  const heightPx = (max[1] - min[1]) * SCALE_Y;
  const padX = Math.round((PLAY_WIDTH - widthPx) / 2);
  const padY = Math.round((PLAY_HEIGHT - heightPx) / 2);
  const sx = (x: number): number => PLAY_X0 + padX + (x - min[0]) * SCALE_X;
  const sy = (y: number): number => PLAY_Y0 + padY + (y - min[1]) * SCALE_Y;
  return { sx, sy, point: ([x, y]) => ({ x: sx(x), y: sy(y) }) };
}

/**
 * The `green` scene palette (docs/games/putt-club.md, "Scene palette: green"): CC-13.5 registers
 * this as `packages/theme/src/scenes/putt-club.ts`, but CC-13.5 hasn't landed yet, so this story
 * draws with the same literal hex the approved spec already documents rather than importing a
 * module that doesn't exist. Once CC-13.5 lands, a follow-up can point this file at
 * `getScenePalette("green")` instead (docs/games/putt-club.md is the single source for the six
 * values either way, so nothing here can drift from the spec in the meantime).
 */
export const green = {
  carpet: "#59D38B" as Hex,
  mown: "#2C8E5C" as Hex,
  kerb: "#B8743F" as Hex,
  water: "#2E86C8" as Hex,
  gravel: "#9AA3B5" as Hex,
} as const;

/**
 * The cup's drawn mouth, in exactly three sizes derived from `captureRadius` (TV scene, "Cup and
 * flag"; readability rule 5): never drawn by eye, so a wide cup always means a forgiving one.
 * `captureRadius` is 0.05 (tight) to 0.10 (forgiving) m (`hole.ts`); the buckets split that range
 * around its two named reference points, 0.07 (standard) and 0.10 (forgiving).
 */
export function cupRadiusPx(captureRadius: number): number {
  if (captureRadius <= 0.06) return 5;
  if (captureRadius <= 0.085) return 6;
  return 8;
}

/** How far apart the mown stripes run along the hole (TV scene, "Carpet"). */
export const stripeSpacingPx = 16;

/** The waiting players' staging line, lower-left of the play area (TV scene, "Players": "The
 * others wait on the path at the lower left in seat order"). Fixed to the play area, not to any
 * hole's own geometry, so it holds for every hole CC-13.8 designs. */
export const waitingSpot = {
  x: PLAY_X0 + 10,
  bottomY: PLAY_Y0 + PLAY_HEIGHT - 12,
  stepY: 14,
} as const;
