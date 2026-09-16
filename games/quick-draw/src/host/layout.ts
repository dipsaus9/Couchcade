import { shape, typeScale, world } from "@couchcade/theme";
import type { TypeRoleName } from "@couchcade/theme";

/**
 * Where things sit in the 480×270 world (docs/games/quick-draw.md, "TV scene"). Every value is a
 * whole world pixel, so the stage's integer zoom keeps each pixel square.
 */

/** World pixels to 1080p pixels: the TV zoom the type scale is written for. */
export const tvZoom = 1080 / world.height;

/** A type role's size in world pixels: `callout` is 160 px at 1080p, so 40 world px. */
export function worldTextPx(role: TypeRoleName): number {
  return Math.round(typeScale[role].tv / tvZoom);
}

/** The TV safe area on every side (HOUSE_STYLE `safe-tv`). */
export const safeArea = {
  x: Math.round(world.width * shape.safeTv),
  y: Math.round(world.height * shape.safeTv),
} as const;

/** Horizon in the upper third. */
export const horizonY = 90;

/** Scoreboard row along the top safe area. */
export const scoreboard = { y: safeArea.y, chipWidth: 40, roundChipWidth: 56, height: 22, gap: 4 };

/** Bottom instruction panel. The bottom-right corner stays free for the stage's room code panel. */
export const bottomPanel = {
  x: safeArea.x,
  y: world.height - safeArea.y - 26,
  width: 300,
  height: 26,
};

/** Centre of the DRAW! callout and the fake words: same style, same place. */
export const callout = { x: world.width / 2, y: 118, angle: -4 } as const;

/** A World Pip is 16×24. */
export const pipSize = { width: 16, height: 24 } as const;

/** Cacti on the street. The crow lands on the second one. */
export const cacti = [
  { x: 44, baseY: 150 },
  { x: 446, baseY: 146 },
] as const;

/** Where a Pip stands. `facing` is 1 for looking right, -1 for looking left. */
export interface PipSlot {
  x: number;
  /** Y of the Pip's feet. */
  feetY: number;
  facing: 1 | -1;
  /** 0 at the front. Rows further back are drawn first. */
  row: number;
}

const leftX = 150;
const rightX = 330;
const frontFeetY = 214;
const depthStaggerPx = 12;
const columnGapPx = 28;

/**
 * Pip positions by seat order. With 2 players they stand at x = 150 and x = 330 facing each
 * other. With 3 to 8, even slots stand on the left and odd slots on the right, each row further
 * back staggered 12 px in depth and moved outwards so labels don't overlap.
 */
export function pipSlots(count: number): PipSlot[] {
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 2);
    const left = index % 2 === 0;
    return {
      x: left ? leftX - row * columnGapPx : rightX + row * columnGapPx,
      feetY: frontFeetY - row * depthStaggerPx,
      facing: left ? 1 : -1,
      row,
    };
  });
}
