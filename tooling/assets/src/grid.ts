/**
 * The "world grid" HOUSE_STYLE.md's style check refers to ("Sprite sheets whose frame sizes
 * aren't multiples of the world grid"): the frame unit every character/object sprite is built on.
 *
 * HOUSE_STYLE.md gives exactly one concrete sprite-frame size, the World Pip
 * ("16×24 pixel sprite" under "Pips: player avatars" > "Two forms"), and no other numeric grid
 * unit outside the 480×270 internal canvas (which itself isn't a multiple of 16 or 24, so it isn't
 * the grid the frame-size rule means). This pipeline takes the World Pip's 16×24 as that grid unit
 * until a future story (e.g. the Pips generator, CC-6) gives it its own token in `@couchcade/theme`
 * — recorded as a decision on CC-4.9, flagged for the owner to confirm or correct.
 */
export const WORLD_GRID = { width: 16, height: 24 } as const;

/** True when both dimensions are a positive multiple of the world grid. */
export function isOnWorldGrid(width: number, height: number): boolean {
  return (
    width > 0 && height > 0 && width % WORLD_GRID.width === 0 && height % WORLD_GRID.height === 0
  );
}
