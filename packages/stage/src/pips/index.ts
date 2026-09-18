import type { PipProfile } from "@couchcade/protocol";
import { color, pip, players, toPhaserColor } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { pipParts } from "@couchcade/utils/pips";
import type { PipHairstyle } from "@couchcade/utils/pips";
import type { GameObjects, Scene } from "phaser";
import { drawPlayerShape } from "../draw/index.ts";

/**
 * The World Pip: a 16×24 pixel sprite for inside a game world, built at runtime from a player's
 * profile and seat by `buildWorldPip` (docs/architecture/pips.md "World Pip"). Faces right; a
 * scene mirrors it with `flipX` to face left. Coordinates below are `(x, y)` from the top-left
 * pixel, exactly as pips.md lists them, so this is a direct port of the spec table, not a
 * redesign.
 */
export const worldPipSize = { width: 16, height: 24 } as const;

export type PipExpression = "neutral" | "happy" | "surprised" | "sad";

export const pipExpressions = [
  "neutral",
  "happy",
  "surprised",
  "sad",
] as const satisfies readonly PipExpression[];

export interface WorldPipFace {
  expression: PipExpression;
  /** An extra frame for any expression: the eyes close, the mouth stays the expression's own. */
  blink?: boolean;
}

/** A profile and a seat: everything `buildWorldPip` needs to paint one look (pips.md "Seat"). */
export interface WorldPipLook {
  profile: PipProfile;
  /** 0 to 7 picks the jersey colour and shape; wraps if out of range (pips.md "Validation"). */
  slot: number;
}

/** Rows of pixels, top to bottom. `null` is transparent. */
type PixelGrid = readonly (readonly (Hex | null)[])[];

function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}

/** The head: a circle of the given radius around (7.5, 8) (pips.md "World Pip"). */
function inHead(x: number, y: number, radius = 5.6): boolean {
  return (x - 7.5) ** 2 + (y - 8) ** 2 <= radius * radius;
}

/** The head row each hairstyle's "hair on top" layer reaches. Bald has no top layer at all. */
const hairTopRow: Record<PipHairstyle, number> = {
  buzz: 3,
  short: 4,
  bun: 4,
  long: 4,
  ponytail: 4,
  cap: 5,
  curls: 5,
  bald: -1,
};

/**
 * Whether `(x, y)` is part of the hairstyle's top layer: the plain head-row cutoff, plus each
 * style's own extra (curls' wider ring, the cap's brim, short's fringe) (pips.md "World Pip").
 */
function isHairOnTop(hair: PipHairstyle, x: number, y: number): boolean {
  if (hair === "bald") return false;
  if (hair === "curls" && y <= 6 && inHead(x, y, 6.7)) return true;
  if (hair === "cap" && y === 6 && x >= 3 && x <= 14) return true;
  if (hair === "short" && y === 5 && x >= 9 && inHead(x, y)) return true;
  return inHead(x, y) && y <= hairTopRow[hair];
}

/** The one back layer a hairstyle needs, drawn before the jersey and head (pips.md "World Pip"). */
function hairBackPixels(hair: PipHairstyle): readonly (readonly [number, number])[] {
  if (hair === "long") {
    const pixels: [number, number][] = [];
    for (let y = 5; y <= 15; y++) for (const x of [2, 3, 12, 13]) pixels.push([x, y]);
    return pixels;
  }
  if (hair === "ponytail") {
    const pixels: [number, number][] = [];
    for (let y = 4; y <= 11; y++) for (const x of [1, 2]) pixels.push([x, y]);
    return pixels;
  }
  if (hair === "bun") {
    const pixels: [number, number][] = [];
    for (let y = 1; y <= 2; y++) for (let x = 6; x <= 9; x++) pixels.push([x, y]);
    return pixels;
  }
  return [];
}

const faceMouths: Record<PipExpression, readonly (readonly [number, number])[]> = {
  neutral: [
    [7, 10],
    [10, 10],
    [8, 11],
    [9, 11],
  ],
  happy: [
    [6, 10],
    [11, 10],
    [7, 11],
    [8, 11],
    [9, 11],
    [10, 11],
  ],
  surprised: [
    [8, 11],
    [9, 11],
    [8, 12],
    [9, 12],
  ],
  sad: [
    [7, 11],
    [8, 11],
    [9, 11],
    [10, 11],
  ],
};

/** Eyes: dot eyes for neutral/surprised/sad, arcs for happy, or the blink frame over either. */
function faceEyes(face: WorldPipFace): readonly (readonly [number, number])[] {
  if (face.blink) {
    return [
      [5, 9],
      [6, 9],
      [10, 9],
      [11, 9],
    ];
  }
  if (face.expression === "happy") {
    return [
      [5, 9],
      [6, 8],
      [7, 9],
      [10, 9],
      [11, 8],
      [12, 9],
    ];
  }
  return [
    [6, 9],
    [11, 9],
  ];
}

/** A texture key part for a look and face, so equal Pips share one texture (pips.md "Textures"). */
export function worldPipKey(look: WorldPipLook, face: WorldPipFace): string {
  const { skin, hair, hairColour } = look.profile;
  const eyes = face.blink ? "blink" : "open";
  return `pip:world:${skin}-${hair}-${hairColour}-${look.slot}-${face.expression}-${eyes}`;
}

/** The pixel grid for one look and face, palette-indexed from the profile, seat and theme. */
function worldPipGrid(look: WorldPipLook, face: WorldPipFace): PixelGrid {
  const { width, height } = worldPipSize;
  const grid: (Hex | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null),
  );
  const set = (x: number, y: number, value: Hex): void => {
    const row = grid[y];
    if (row && x >= 0 && x < width) row[x] = value;
  };
  const at = (x: number, y: number): Hex | null => grid[y]?.[x] ?? null;

  const seat = players[wrap(look.slot, players.length)] as (typeof players)[number];
  const skin = pip.skin[wrap(look.profile.skin, pip.skin.length)] as Hex;
  const hairColour = pip.hair[wrap(look.profile.hairColour, pip.hair.length)] as Hex;
  const hair = pipParts.hair[wrap(look.profile.hair, pipParts.hair.length)] as PipHairstyle;

  // Hair behind: drawn first, so the jersey and head paint over any overlap.
  for (const [x, y] of hairBackPixels(hair)) set(x, y, hairColour);

  // Jersey: rows 14 to 22, narrower at the shoulders (row 14 cols 4-11, row 15 cols 3-12, rows
  // 16-22 cols 2-13), player colour.
  for (let y = 14; y <= 22; y++) {
    const inset = y === 14 ? 4 : y === 15 ? 3 : 2;
    for (let x = inset; x <= width - 1 - inset; x++) set(x, y, seat.color);
  }
  // Chest: Chalk at (7,17), (8,17), (7,18), (8,18) (owner decision 1, 2026-09-17).
  for (const [x, y] of [
    [7, 17],
    [8, 17],
    [7, 18],
    [8, 18],
  ] as const) {
    set(x, y, color.chalk);
  }

  // Head: every pixel in the 5.6px-radius circle, skin tone.
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < width; x++) if (inHead(x, y)) set(x, y, skin);
  }

  // Hair on top, per hairstyle.
  for (let y = 0; y <= 6; y++) {
    for (let x = 0; x < width; x++) if (isHairOnTop(hair, x, y)) set(x, y, hairColour);
  }

  // Face: eyes, then this expression's mouth (unaffected by blink).
  for (const [x, y] of faceEyes(face)) set(x, y, color.ink);
  for (const [x, y] of faceMouths[face.expression]) set(x, y, color.ink);

  // Chin: where a skin pixel on row 13 sits above a jersey pixel on row 14, that pixel turns Ink.
  for (let x = 0; x < width; x++) {
    if (at(x, 13) === skin && at(x, 14) === seat.color) set(x, 14, color.ink);
  }

  // Outline: every empty pixel that touches a filled pixel on one of its four sides becomes Ink.
  const filled = grid.map((row) => row.map((value) => value !== null));
  const isFilled = (x: number, y: number): boolean => filled[y]?.[x] === true;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isFilled(x, y)) continue;
      if (isFilled(x - 1, y) || isFilled(x + 1, y) || isFilled(x, y - 1) || isFilled(x, y + 1)) {
        set(x, y, color.ink);
      }
    }
  }

  return grid;
}

/**
 * Ensures the Phaser texture for a look and face exists in the scene's texture manager and
 * returns its key, painting it once and caching it under `pip:world:<skin>-<hair>-<hairColour>-
 * <slot>-<expression>-<eyes>` (pips.md "Textures"). Call it when a game starts or a player joins,
 * never in the update loop — Phaser textures outlive the scene that created them, so a second
 * request for an equal look reuses the cached one.
 */
export function buildWorldPip(
  scene: Scene,
  look: WorldPipLook,
  face: WorldPipFace = { expression: "neutral" },
): string {
  const key = worldPipKey(look, face);
  const { textures } = scene;
  if (textures.exists(key)) return key;
  const { width, height } = worldPipSize;
  const texture = textures.createCanvas(key, width, height);
  if (texture === null) throw new Error(`Couldn't create the World Pip texture ${key}`);
  const image = texture.context.createImageData(width, height);
  worldPipGrid(look, face).forEach((row, y) => {
    row.forEach((value, x) => {
      if (value === null) return;
      const n = toPhaserColor(value);
      const i = (y * width + x) * 4;
      image.data[i] = (n >> 16) & 255;
      image.data[i + 1] = (n >> 8) & 255;
      image.data[i + 2] = n & 255;
      image.data[i + 3] = 255;
    });
  });
  texture.context.putImageData(image, 0, 0);
  texture.refresh();
  return key;
}

/**
 * Where a World Pip's top-left pixel sits for a player standing at world position `(x, feetY)`
 * (pips.md "In a scene": depth then sorts by `feetY`).
 */
export function worldPipOrigin(x: number, feetY: number): { x: number; y: number } {
  return { x: x - worldPipSize.width / 2, y: feetY - worldPipSize.height };
}

/**
 * Draws the seat's 9×9 shape mark just under the feet, one depth step behind the Pip
 * (pips.md "In a scene", owner decision 1: the shape stands under the feet, not on the chest).
 * Callers set the graphics object's own depth one step behind the Pip's own.
 */
export function drawWorldPipMarker(
  graphics: GameObjects.Graphics,
  slot: number,
  x: number,
  feetY: number,
): void {
  const seat = players[wrap(slot, players.length)] as (typeof players)[number];
  drawPlayerShape(graphics, seat.shape, seat.color, x - 5, feetY);
}
