import { color, font, toPhaserColor, typeScale } from "@couchcade/theme";
import type { Hex, PlayerShape, TypeRoleName } from "@couchcade/theme";
import type { GameObjects, Types } from "phaser";
import { metrics, tvPx } from "../layout/index.ts";
import type { Rect } from "../layout/index.ts";

export interface SlabOptions {
  /** Fill colour. Defaults to Chalk. */
  fill?: Hex;
  /** Corner radius in world pixels. `"pill"` rounds the short side fully. Defaults to `radius-panel`. */
  radius?: number | "pill";
  /** Hard Ink shadow straight down, in world pixels. Defaults to `depth-panel`. */
  depth?: number;
  /** A ring drawn outside the Ink outline, such as the Sunny highlight on the active chip. */
  ring?: Hex;
}

/**
 * Draws a toy-like slab: a hard Ink shadow, an Ink outline and a flat fill (HOUSE_STYLE "Shape
 * and depth"). Everything is filled, not stroked, so the outline stays a whole pixel wide.
 * `rect` is the outer edge of the outline; the shadow and ring sit outside it.
 */
export function drawSlab(graphics: GameObjects.Graphics, rect: Rect, options: SlabOptions = {}) {
  const { x, y, width, height } = rect;
  const { outline } = metrics;
  const depth = options.depth ?? metrics.depth;
  const radiusFor = (w: number, h: number): number =>
    options.radius === "pill"
      ? Math.min(w, h) / 2
      : Math.min(options.radius ?? metrics.panelRadius, w / 2, h / 2);
  const ink = toPhaserColor(color.ink);

  if (depth > 0) {
    graphics.fillStyle(ink);
    graphics.fillRoundedRect(x, y + depth, width, height, radiusFor(width, height));
  }
  // Like a CSS outline: around the outline, on top of the shadow.
  if (options.ring) {
    const ring = outline;
    graphics.fillStyle(toPhaserColor(options.ring));
    graphics.fillRoundedRect(
      x - ring,
      y - ring,
      width + 2 * ring,
      height + 2 * ring,
      radiusFor(width + 2 * ring, height + 2 * ring),
    );
  }
  graphics.fillStyle(ink);
  graphics.fillRoundedRect(x, y, width, height, radiusFor(width, height));
  graphics.fillStyle(toPhaserColor(options.fill ?? color.chalk));
  graphics.fillRoundedRect(
    x + outline,
    y + outline,
    width - 2 * outline,
    height - 2 * outline,
    radiusFor(width - 2 * outline, height - 2 * outline),
  );
}

/**
 * The eight player shapes as 7×7 pixel masks. At the world's resolution a vector shape turns to
 * mush, so the stage draws them as pixel art with a 1px Ink outline, like World Pips.
 */
export const shapeMasks = {
  circle: ["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."],
  square: ["#######", "#######", "#######", "#######", "#######", "#######", "#######"],
  triangle: ["...#...", "..###..", "..###..", ".#####.", ".#####.", "#######", "#######"],
  diamond: ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
  star: ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", ".#...#."],
  hexagon: ["...#...", ".#####.", "#######", "#######", "#######", ".#####.", "...#..."],
  heart: [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."],
  plus: ["..###..", "..###..", "#######", "#######", "#######", "..###..", "..###.."],
} as const satisfies Record<PlayerShape, readonly string[]>;

/** Width and height of a drawn player shape: the 7×7 mask plus its 1px outline on each side. */
export const SHAPE_SIZE = 9;

/**
 * Draws a player shape with its top-left corner at (x, y), filled with the player's colour and
 * outlined in Ink. The outline is every pixel next to the mask (four neighbours).
 */
export function drawPlayerShape(
  graphics: GameObjects.Graphics,
  playerShape: PlayerShape,
  fill: Hex,
  x: number,
  y: number,
): void {
  const mask = shapeMasks[playerShape];
  const size = mask.length;
  const filled = (col: number, row: number): boolean => mask[row]?.[col] === "#";
  const inkPixels: [number, number][] = [];
  const fillPixels: [number, number][] = [];
  for (let row = -1; row <= size; row++) {
    for (let col = -1; col <= size; col++) {
      if (filled(col, row)) fillPixels.push([col, row]);
      else if (
        filled(col - 1, row) ||
        filled(col + 1, row) ||
        filled(col, row - 1) ||
        filled(col, row + 1)
      ) {
        inkPixels.push([col, row]);
      }
    }
  }
  graphics.fillStyle(toPhaserColor(color.ink));
  for (const [col, row] of inkPixels) graphics.fillRect(x + 1 + col, y + 1 + row, 1, 1);
  graphics.fillStyle(toPhaserColor(fill));
  for (const [col, row] of fillPixels) graphics.fillRect(x + 1 + col, y + 1 + row, 1, 1);
}

/** A Phaser text style for a house style type role at TV size, in world pixels. */
export function textStyle(
  role: TypeRoleName,
  fill: Hex = color.ink,
): Types.GameObjects.Text.TextStyle {
  const { font: family, weight, tv } = typeScale[role];
  return {
    fontFamily: font[family],
    fontSize: `${tvPx(tv)}px`,
    fontStyle: String(weight),
    color: fill,
  };
}
