import { world } from "@couchcade/theme";
import { Math as PhaserMath } from "phaser";
import type { GameObjects } from "phaser";
import type { PlayerShape } from "@couchcade/theme";
import { cacti, horizonY } from "./layout.ts";
import { palette } from "./palette.ts";
import { shapePoints } from "./shapes.ts";
import type { PipPresentation } from "./present.ts";

/**
 * Placeholder art drawn with Phaser graphics: flat fills from the theme, 1 px Ink outlines on
 * characters and interactive objects, none on the background (HOUSE_STYLE "Game worlds").
 * CC-10.8 swaps these shapes for the stage's World Pips and recoloured CC0 sprites.
 */

type Graphics = GameObjects.Graphics;

const shapeCache = new Map<PlayerShape, PhaserMath.Vector2[]>();

/** A player shape with an Ink outline, centred on (x, y). */
export function drawShape(
  g: Graphics,
  shape: PlayerShape,
  x: number,
  y: number,
  fill: number,
): void {
  let points = shapeCache.get(shape);
  if (points === undefined) {
    points = shapePoints(shape, 4).map((point) => new PhaserMath.Vector2(point.x, point.y));
    shapeCache.set(shape, points);
  }
  g.save();
  g.translateCanvas(x, y);
  g.fillStyle(fill);
  g.fillPoints(points, true);
  g.lineStyle(1, palette.ink);
  g.strokePoints(points, true);
  g.restore();
}

/** Sky, mesas on the horizon, the sandy street, rocks and two cacti. Drawn once. */
export function drawBackdrop(g: Graphics): void {
  g.fillStyle(palette.sky);
  g.fillRect(0, 0, world.width, horizonY);

  // Mesas: flat-topped silhouettes sitting on the horizon.
  g.fillStyle(palette.mesa);
  for (const [x, width, height] of [
    [16, 70, 26],
    [70, 40, 16],
    [196, 96, 34],
    [330, 54, 20],
    [370, 90, 30],
  ] as const) {
    g.fillRect(x, horizonY - height, width, height);
    g.fillRect(x - 6, horizonY - height + 8, width + 12, height - 8);
  }

  g.fillStyle(palette.sand);
  g.fillRect(0, horizonY, world.width, world.height - horizonY);

  // The street's edges: rows of mesa-coloured pebbles, and a few rocks.
  g.fillStyle(palette.mesa);
  for (let x = 4; x < world.width; x += 24) {
    g.fillRect(x, 150, 6, 2);
    g.fillRect(x + 12, 232, 6, 2);
  }
  for (const [x, y] of [
    [96, 128],
    [388, 176],
    [30, 204],
    [252, 244],
  ] as const) {
    g.fillRect(x, y, 8, 4);
    g.fillRect(x + 2, y - 2, 4, 2);
  }

  g.fillStyle(palette.cactus);
  for (const { x, baseY } of cacti) {
    g.fillRect(x - 3, baseY - 28, 6, 28);
    g.fillRect(x - 10, baseY - 20, 4, 10);
    g.fillRect(x - 10, baseY - 12, 8, 3);
    g.fillRect(x + 6, baseY - 24, 4, 8);
    g.fillRect(x + 2, baseY - 18, 8, 3);
  }
}

/** The tumbleweed rolling past during `intro`: 4 frames. */
export function drawTumbleweed(g: Graphics, x: number, frame: number): void {
  const y = 196;
  g.fillStyle(palette.mesa);
  g.fillCircle(x, y, 6);
  g.lineStyle(1, palette.sand);
  const angle = (frame * Math.PI) / 4;
  for (const offset of [0, Math.PI / 2]) {
    const dx = Math.round(Math.cos(angle + offset) * 5);
    const dy = Math.round(Math.sin(angle + offset) * 5);
    g.lineBetween(x - dx, y - dy, x + dx, y + dy);
  }
}

/** The crow fake on the second cactus: frame 0 sits, 1 wings up, 2 wings down. */
export function drawCrow(g: Graphics, frame: number): void {
  const cactus = cacti[1];
  const x = cactus.x;
  const y = cactus.baseY - 32;
  g.fillStyle(palette.ink);
  g.fillRect(x - 4, y - 2, 8, 5);
  g.fillRect(x - 6, y - 5, 4, 4);
  g.fillStyle(palette.sunny);
  g.fillRect(x - 8, y - 4, 2, 1);
  g.fillStyle(palette.ink);
  if (frame === 1) g.fillTriangle(x - 2, y - 2, x + 4, y - 2, x + 3, y - 10);
  if (frame === 2) g.fillTriangle(x - 2, y + 2, x + 4, y + 2, x + 3, y + 8);
}

/** Where a Pip's popgun muzzle is. */
export function muzzle(pip: PipPresentation): { x: number; y: number } {
  const { x, feetY, facing } = pip.slot;
  return pip.pose === "drawn"
    ? { x: x + facing * 12, y: feetY - 14 }
    : { x: x + facing * 8, y: feetY - 7 };
}

/** The glint fake: a 16×16 sparkle on a popgun, 3 frames. */
export function drawGlint(g: Graphics, x: number, y: number, frame: number): void {
  const arm = [3, 7, 5][frame] ?? 5;
  // A 1 px Ink edge keeps the Chalk sparkle readable against the sand.
  g.fillStyle(palette.ink);
  g.fillRect(x - arm - 1, y - 1, arm * 2 + 3, 3);
  g.fillRect(x - 1, y - arm - 1, 3, arm * 2 + 3);
  g.fillStyle(palette.chalk);
  g.fillRect(x - arm, y, arm * 2 + 1, 1);
  g.fillRect(x, y - arm, 1, arm * 2 + 1);
  if (frame === 1) {
    for (const d of [-2, 2]) {
      g.fillRect(x + d, y + d, 1, 1);
      g.fillRect(x + d, y - d, 1, 1);
    }
  }
  g.fillStyle(palette.sunny);
  g.fillRect(x, y, 1, 1);
}

/** The dust puff blowing past on `result`: 4 frames. */
export function drawDust(g: Graphics, x: number, frame: number): void {
  const y = 206;
  g.fillStyle(palette.chalk);
  g.fillCircle(x, y, 3 + frame);
  g.fillCircle(x - 7, y + 2, 2 + frame);
  g.fillCircle(x + 6, y + 3, 2 + Math.max(0, frame - 1));
}

export interface PipLook {
  jersey: number;
  shape: PlayerShape;
  skin: number;
  hair: number;
}

/**
 * A placeholder World Pip, 16×24 with its feet on `slot.feetY`: head, hair, dot eyes, a mouth
 * for the expression, a jersey in the player colour with the player shape under the feet, and a
 * popgun held low (`ready`) or raised (`drawn`).
 */
export function drawPip(g: Graphics, pip: PipPresentation, look: PipLook): void {
  const { x, feetY, facing } = pip.slot;

  drawShape(g, look.shape, x, feetY + 5, look.jersey);

  // Legs and jersey.
  g.fillStyle(palette.ink);
  g.fillRect(x - 4, feetY - 4, 3, 4);
  g.fillRect(x + 1, feetY - 4, 3, 4);
  g.fillStyle(look.jersey);
  g.fillRect(x - 6, feetY - 13, 12, 9);
  g.lineStyle(1, palette.ink);
  g.strokeRect(x - 6, feetY - 13, 12, 9);

  // Head.
  const headY = feetY - 18;
  g.fillStyle(look.skin);
  g.fillCircle(x, headY, 5);
  g.lineStyle(1, palette.ink);
  g.strokeCircle(x, headY, 5);
  g.fillStyle(look.hair);
  g.fillRect(x - 4, headY - 6, 8, 3);

  // Face, looking across the street.
  const eyeX = x + facing;
  g.fillStyle(palette.ink);
  if (pip.blink) {
    g.fillRect(eyeX - 3, headY - 1, 2, 1);
    g.fillRect(eyeX + 1, headY - 1, 2, 1);
  } else if (pip.expression === "happy") {
    g.fillRect(eyeX - 3, headY - 2, 2, 1);
    g.fillRect(eyeX + 1, headY - 2, 2, 1);
  } else {
    g.fillRect(eyeX - 2, headY - 2, 1, 2);
    g.fillRect(eyeX + 2, headY - 2, 1, 2);
  }
  if (pip.expression === "surprised") g.fillRect(eyeX - 1, headY + 1, 2, 2);
  else if (pip.expression === "happy") {
    g.fillRect(eyeX - 2, headY + 2, 4, 1);
    g.fillRect(eyeX - 3, headY + 1, 1, 1);
    g.fillRect(eyeX + 2, headY + 1, 1, 1);
  } else g.fillRect(eyeX - 1, headY + 2, 2, 1);

  // Popgun: a toy with a cork, held low until the player draws.
  const gun = muzzle(pip);
  g.fillStyle(palette.ink);
  const barrel = pip.pose === "drawn" ? 8 : 5;
  g.fillRect(facing === 1 ? gun.x - barrel : gun.x, gun.y, barrel, 2);
  g.fillStyle(palette.mesa);
  g.fillRect(facing === 1 ? gun.x - barrel : gun.x + barrel - 2, gun.y + 2, 2, 3);
}

/**
 * The BANG! flag popping out of a winner's popgun, `progress` 0 to 1. Returns where its label
 * goes once the flag is fully out, or null while it's still unfolding.
 */
export function drawFlag(
  g: Graphics,
  pip: PipPresentation,
  progress: number,
): { x: number; y: number } | null {
  const { facing } = pip.slot;
  const gun = muzzle(pip);
  const width = Math.max(1, Math.round(30 * progress));
  const stickEnd = gun.x + facing * 4;
  g.fillStyle(palette.ink);
  g.fillRect(Math.min(gun.x, stickEnd), gun.y, 4, 1);
  const left = facing === 1 ? stickEnd : stickEnd - width;
  const top = gun.y - 10;
  g.fillStyle(palette.chalk);
  g.fillRect(left, top, width, 11);
  g.lineStyle(1, palette.ink);
  g.strokeRect(left, top, width, 11);
  return progress >= 1 ? { x: left + width / 2, y: top + 6 } : null;
}

/** A chunky chip or panel: Chalk (or `fill`), 1 px Ink outline (4 px on TV), hard Ink shadow. */
export function drawPanel(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: number = palette.chalk,
): void {
  const radius = Math.min(5, height / 2);
  g.fillStyle(palette.ink);
  g.fillRoundedRect(x, y + 2, width, height, radius);
  g.fillStyle(fill);
  g.fillRoundedRect(x, y, width, height, radius);
  g.lineStyle(1, palette.ink);
  g.strokeRoundedRect(x, y, width, height, radius);
}
