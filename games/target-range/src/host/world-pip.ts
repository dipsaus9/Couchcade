import { color, pip, players } from "@couchcade/theme";
import type { Hex, PlayerShape } from "@couchcade/theme";
import type { Expression } from "./present.ts";

/**
 * World Pips for Target Range: 16×24 pixel sprites with a 1px Ink outline (HOUSE_STYLE "Pips").
 * The Pip parts spec (CC-6) and the stage's World Pips (CC-6.4) don't exist yet, so this is the
 * same placeholder as Quick Draw's games/quick-draw/src/host/world-pip.ts (games never import
 * each other; CC-6.4 replaces both): a round head in the player's skin tone with short hair, dot
 * eyes, a jersey in the seat colour with a Chalk chest mark. It faces right; the scene mirrors it
 * for the Pips on the right.
 */

export const worldPipSize = { width: 16, height: 24 } as const;

/** Rows of pixels, top to bottom. `null` is transparent. */
export type PixelGrid = readonly (readonly (Hex | null)[])[];

export interface WorldPipLook {
  jersey: Hex;
  shape: PlayerShape;
  skin: Hex;
  hair: Hex;
}

export interface WorldPipFace {
  expression: Expression;
  blink: boolean;
}

/** The head: a circle of radius 5.6 around (7.5, 8). */
const inHead = (x: number, y: number): boolean => (x - 7.5) ** 2 + (y - 8) ** 2 <= 5.6 ** 2;

const wrap = <T>(list: readonly T[], index: number): T =>
  list[((index % list.length) + list.length) % list.length] as T;

/** A seat's Pip colours: jersey and shape from the slot, skin and hair from the profile. */
export function worldPipLook(
  slot: number,
  profile: { skin: number; hairColour: number } | undefined,
): WorldPipLook {
  const seat = wrap(players, slot);
  return {
    jersey: seat.color,
    shape: seat.shape,
    skin: wrap(pip.skin, profile?.skin ?? 0),
    hair: wrap(pip.hair, profile?.hairColour ?? 0),
  };
}

/** A texture key part for a look and face, so equal Pips share one texture. */
export function worldPipKey(look: WorldPipLook, face: WorldPipFace): string {
  const eyes = face.blink ? "blink" : "open";
  return `${look.jersey}-${look.skin}-${look.hair}-${face.expression}-${eyes}`;
}

/** The Pip facing right. Its face sits 1px to the right of the head's centre. */
export function worldPip(look: WorldPipLook, face: WorldPipFace): PixelGrid {
  const { width, height } = worldPipSize;
  const grid: (Hex | null)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null),
  );
  const set = (x: number, y: number, value: Hex): void => {
    const row = grid[y];
    if (row && x >= 0 && x < width) row[x] = value;
  };
  const at = (x: number, y: number): Hex | null => grid[y]?.[x] ?? null;

  // Jersey: rows 14 to 22, narrower at the shoulders, with a Chalk chest mark.
  for (let y = 14; y <= 22; y++) {
    const inset = y === 14 ? 4 : y === 15 ? 3 : 2;
    for (let x = inset; x <= width - 1 - inset; x++) set(x, y, look.jersey);
  }
  for (const [x, y] of [
    [7, 17],
    [8, 17],
    [7, 18],
    [8, 18],
  ] as const) {
    set(x, y, color.chalk);
  }

  // Head: a circle in the skin tone, short hair on top with a fringe to the front.
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < width; x++) {
      if (!inHead(x, y)) continue;
      set(x, y, y <= 4 || (y === 5 && x >= 9) ? look.hair : look.skin);
    }
  }

  // Face (HOUSE_STYLE "Expressions"): dot eyes and a small smile, arcs and a big smile when
  // happy, an O mouth when surprised. Blinking closes the eyes to short lines.
  const ink = color.ink;
  const eyes = [6, 11] as const;
  if (face.blink) {
    for (const x of eyes) {
      set(x - 1, 9, ink);
      set(x, 9, ink);
    }
  } else if (face.expression === "happy") {
    for (const x of eyes) {
      set(x - 1, 9, ink);
      set(x, 8, ink);
      set(x + 1, 9, ink);
    }
  } else {
    for (const x of eyes) set(x, 9, ink);
  }
  if (face.expression === "happy") {
    for (const [x, y] of [
      [6, 10],
      [11, 10],
      [7, 11],
      [8, 11],
      [9, 11],
      [10, 11],
    ] as const) {
      set(x, y, ink);
    }
  } else if (face.expression === "surprised") {
    for (const [x, y] of [
      [8, 11],
      [9, 11],
      [8, 12],
      [9, 12],
    ] as const) {
      set(x, y, ink);
    }
  } else {
    for (const [x, y] of [
      [7, 10],
      [10, 10],
      [8, 11],
      [9, 11],
    ] as const) {
      set(x, y, ink);
    }
  }

  // The chin line where the head meets the jersey.
  for (let x = 0; x < width; x++) {
    if (at(x, 13) === look.skin && at(x, 14) === look.jersey) set(x, 14, ink);
  }

  // A 1px Ink outline around everything.
  const filled = grid.map((row) => row.map((value) => value !== null));
  const isFilled = (x: number, y: number) => filled[y]?.[x] === true;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isFilled(x, y)) continue;
      if (isFilled(x - 1, y) || isFilled(x + 1, y) || isFilled(x, y - 1) || isFilled(x, y + 1)) {
        set(x, y, ink);
      }
    }
  }
  return grid;
}
