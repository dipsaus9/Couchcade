/**
 * Where things sit in the 480×270 world (docs/games/quick-draw.md, "TV scene"). Every value is a
 * whole world pixel, so the stage's integer zoom keeps each pixel square. The stage
 * scoreboard takes the top of the TV safe area and the instruction and room code panels its
 * bottom 15%, so the street and the Pips stay between them.
 */

/** Horizon in the upper third. */
export const horizonY = 90;

/** The dusty main street: a band of 16px street tiles the Pips stand on. */
export const street = { top: 128, rows: 5 } as const;

/** Centre of the DRAW! callout and the fake words: same style, same place. */
export const calloutAt = { x: 240, y: 98 } as const;

/** Cacti on the roadside, by their bottom-centre. The crow lands on the second one. */
export const cacti = [
  { x: 40, baseY: 124 },
  { x: 444, baseY: 126 },
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
const frontFeetY = 200;
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
