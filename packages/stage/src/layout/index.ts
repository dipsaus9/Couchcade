import { shape, world } from "@couchcade/theme";

/**
 * TV pixels (at 1080p) per world pixel. The TV shows the 480×270 world at ×4, so the overlays
 * are laid out in world pixels: every size in the house style and the design canvas is a 1080p
 * value, divided by this.
 */
export const TV_PIXELS_PER_WORLD_PIXEL = 1080 / world.height;

/** A 1080p TV size from the house style, in world pixels. May be fractional; round where drawn. */
export function tvPx(px: number): number {
  return px / TV_PIXELS_PER_WORLD_PIXEL;
}

/** An axis-aligned rectangle in world pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The TV safe area (`safe-tv`, 5% on every side), in whole world pixels and rounded inwards,
 * so anything inside it stays inside the 5% on the TV.
 */
export const safeArea = (() => {
  const insetX = Math.ceil(world.width * shape.safeTv);
  const insetY = Math.ceil(world.height * shape.safeTv);
  return {
    left: insetX,
    top: insetY,
    right: world.width - insetX,
    bottom: world.height - insetY,
    width: world.width - 2 * insetX,
    height: world.height - 2 * insetY,
  } as const;
})();

/**
 * Depth of the overlay layer. Game world objects keep Phaser's default depth (0) or anything
 * below this, so the scoreboard, callouts and room code always draw on top.
 */
export const OVERLAY_DEPTH = 1_000_000;

/** Interface measurements shared by the overlays, in whole world pixels. */
export const metrics = {
  /** `outline`: 4px on the TV. */
  outline: Math.round(tvPx(shape.outline.tv)),
  /** `depth-panel`: the hard Ink shadow under panels and chips (6px on the TV). */
  depth: Math.round(tvPx(shape.depth.panel)),
  /** `radius-panel` (20px on the TV). */
  panelRadius: Math.round(tvPx(shape.radius.panel)),
} as const;
