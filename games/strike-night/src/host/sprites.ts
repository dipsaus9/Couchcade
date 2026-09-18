import type { Loader, Textures } from "phaser";
import ball from "../../assets/sprites/ball.png?inline";
import bench from "../../assets/sprites/bench.png?inline";
import ceilingLight from "../../assets/sprites/ceiling-light.png?inline";
import chair from "../../assets/sprites/chair.png?inline";
import lanePlank from "../../assets/sprites/lane-plank.png?inline";
import pictureFrame from "../../assets/sprites/picture-frame.png?inline";
import pin from "../../assets/sprites/pin.png?inline";
import pottedPlant from "../../assets/sprites/potted-plant.png?inline";
import table from "../../assets/sprites/table.png?inline";
import targetArrow from "../../assets/sprites/target-arrow.png?inline";

/**
 * Strike Night's sprites, from games/strike-night/assets/sprites (CC0 furniture recoloured onto
 * `alley`, everything else drawn from scratch on the palette directly -- see CREDITS.md and
 * docs/games/strike-night.md, "CC0 asset shortlist"). Every file is a few hundred bytes, so
 * `?inline` bundles them as data URIs with the scene: no extra requests, same pattern as Quick
 * Draw's `sprites.ts`. Frames tile/reuse instead of pre-rendering every size CC-12.5's budget note
 * called out (`docs/games/strike-night.md`, "CC0 asset shortlist": "small sprite sheets,
 * reused/tiled textures") -- one ball and one pin texture is scaled per shot, not redrawn per size.
 */

interface SpriteSource {
  key: string;
  url: string;
  /** Animation frame size. Omit for a single image. */
  frame?: { width: number; height: number };
}

const ballFrame = { width: 8, height: 8 } as const;

/** Texture keys carry the game id: every game shares Phaser's texture manager. */
export const sprites = {
  /** 4 frames: a rotating seam sells the roll; the host scales one texture for both shots. */
  ball: { key: "strike-night:ball", url: ball, frame: ballFrame },
  /** Single upright frame; the host rotates it 90deg to show a fallen pin instead of a second
   * sprite (cheaper than tumble frames, and reads fine at this size). */
  pin: { key: "strike-night:pin", url: pin },
  bench: { key: "strike-night:bench", url: bench },
  chair: { key: "strike-night:chair", url: chair },
  table: { key: "strike-night:table", url: table },
  pictureFrame: { key: "strike-night:picture-frame", url: pictureFrame },
  pottedPlant: { key: "strike-night:potted-plant", url: pottedPlant },
  ceilingLight: { key: "strike-night:ceiling-light", url: ceilingLight },
  targetArrow: { key: "strike-night:target-arrow", url: targetArrow },
  /** 8x8 board tile, `TileSprite`-repeated across the pin-shot deck (the approach shot's lane and
   * gutters are perspective trapezoids instead, drawn with `Graphics` -- see `plankSurface` in
   * world.ts -- since Phaser 4's `GeometryMask` only clips in the Canvas renderer). */
  lanePlank: { key: "strike-night:lane-plank", url: lanePlank },
} as const satisfies Record<string, SpriteSource>;

/** Roll frame for a ball that has travelled `distance` world px, 8px per frame step. */
export function ballRollFrame(distance: number): number {
  return Math.floor(distance / 8) % 4;
}

/**
 * Queues every sprite that isn't loaded yet. Textures outlive a scene, so a second match reuses
 * them instead of loading a key that already exists.
 */
export function loadSprites(load: Loader.LoaderPlugin, textures: Textures.TextureManager): void {
  for (const sprite of Object.values(sprites) as SpriteSource[]) {
    if (textures.exists(sprite.key)) continue;
    if (sprite.frame) {
      load.spritesheet(sprite.key, sprite.url, {
        frameWidth: sprite.frame.width,
        frameHeight: sprite.frame.height,
      });
    } else {
      load.image(sprite.key, sprite.url);
    }
  }
}
