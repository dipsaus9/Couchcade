/**
 * The "world grid" HOUSE_STYLE.md's style check refers to ("Sprite sheets whose frame sizes
 * aren't multiples of the world grid"): the frame unit every character/object sprite is built on.
 *
 * HOUSE_STYLE.md doesn't define a numeric grid unit anywhere: the only concrete sprite-frame size
 * it gives is the World Pip ("16×24 pixel sprite" under "Pips: player avatars" > "Two forms"), and
 * the 480×270 internal canvas isn't itself a multiple of 16 or 24. An earlier version of this file
 * took the World Pip's 16×24 as the grid unit, but that would reject common CC0 frame sizes later
 * game art stories need (16×16 tiles, 32×32 props, 24×24 characters from Kenney-style packs).
 *
 * World grid = 8 px (orchestrator decision, 2026-09-16; HOUSE_STYLE does not define it, owner to
 * confirm): both frame dimensions must be a multiple of 8. The 16×24 World Pip still passes (both
 * 16 and 24 are multiples of 8).
 */
export const WORLD_GRID = { width: 8, height: 8 } as const;

/** True when both dimensions are a positive multiple of the world grid. */
export function isOnWorldGrid(width: number, height: number): boolean {
  return (
    width > 0 && height > 0 && width % WORLD_GRID.width === 0 && height % WORLD_GRID.height === 0
  );
}
