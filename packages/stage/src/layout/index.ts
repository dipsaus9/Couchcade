import { shape, world } from "@couchcade/theme";

/**
 * The overlay layer's coordinate space: the 1080p TV frame of the house style and the design
 * canvas. Every overlay size is a 1080p design value used as is, and the overlay camera scales
 * the frame to the screen, so text is drawn at the screen's own resolution.
 */
export const overlayFrame = { width: 1920, height: 1080 } as const;

/** Overlay pixels per world pixel: the 480×270 world fills the 1920×1080 frame at ×4. */
export const OVERLAY_PIXELS_PER_WORLD_PIXEL = overlayFrame.height / world.height;

/** A world position (or size) in overlay pixels, to put an overlay on something in the world. */
export function worldToOverlay(px: number): number {
  return px * OVERLAY_PIXELS_PER_WORLD_PIXEL;
}

/** An axis-aligned rectangle. Overlays measure in overlay pixels, the world in world pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The TV safe area (`safe-tv`, 5% on every side) in overlay pixels, rounded inwards: 96px left
 * and right, 54px top and bottom, like the Vue screens' frame.
 */
export const safeArea = (() => {
  const insetX = Math.ceil(overlayFrame.width * shape.safeTv);
  const insetY = Math.ceil(overlayFrame.height * shape.safeTv);
  return {
    left: insetX,
    top: insetY,
    right: overlayFrame.width - insetX,
    bottom: overlayFrame.height - insetY,
    width: overlayFrame.width - 2 * insetX,
    height: overlayFrame.height - 2 * insetY,
  } as const;
})();

/**
 * Depth of the overlay layer. Game world objects keep Phaser's default depth (0) or anything
 * below this. The overlay has its own camera, so this only orders the display list.
 */
export const OVERLAY_DEPTH = 1_000_000;

/** Interface measurements shared by the overlays, in overlay pixels (1080p TV values). */
export const metrics = {
  /** `outline`: 4px on the TV. */
  outline: shape.outline.tv,
  /** `depth-panel`: the hard Ink shadow under panels and chips. */
  depth: shape.depth.panel,
  /** `radius-panel`. */
  panelRadius: shape.radius.panel,
} as const;

/** Where the stage draws on a canvas: the world's box, its zoom and the overlay's zoom. */
export interface StageViewport extends Rect {
  /** Screen pixels per world pixel: the largest whole number that fits, never below 1. */
  worldZoom: number;
  /** Screen pixels per overlay pixel: `worldZoom / 4`, so 1 on a 1920×1080 canvas. */
  overlayZoom: number;
}

/**
 * Fits the 480×270 world into a canvas at the largest whole-number zoom (×4 at 1080p, ×8 at 4K),
 * centred, with the rest letterboxed (HOUSE_STYLE "Game worlds"). The overlay covers the same box.
 */
export function stageViewport(canvasWidth: number, canvasHeight: number): StageViewport {
  const fit = Math.min(canvasWidth / world.width, canvasHeight / world.height);
  const worldZoom = Math.max(1, Math.floor(fit));
  const width = world.width * worldZoom;
  const height = world.height * worldZoom;
  return {
    x: Math.floor((canvasWidth - width) / 2),
    y: Math.floor((canvasHeight - height) / 2),
    width,
    height,
    worldZoom,
    overlayZoom: worldZoom / OVERLAY_PIXELS_PER_WORLD_PIXEL,
  };
}
