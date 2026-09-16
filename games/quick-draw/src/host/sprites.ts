import type { Loader, Textures } from "phaser";
import cactusBarrel from "../../assets/sprites/cactus-barrel.png?inline";
import cactusSaguaro from "../../assets/sprites/cactus-saguaro.png?inline";
import crow from "../../assets/sprites/crow.png?inline";
import dustPuff from "../../assets/sprites/dust-puff.png?inline";
import groundSandSpeckled from "../../assets/sprites/ground-sand-speckled.png?inline";
import mesa from "../../assets/sprites/mesa.png?inline";
import popgunBang from "../../assets/sprites/popgun-bang.png?inline";
import popgunSparkle from "../../assets/sprites/popgun-sparkle.png?inline";
import rockBoulder from "../../assets/sprites/rock-boulder.png?inline";
import rockPile from "../../assets/sprites/rock-pile.png?inline";
import tumbleweed from "../../assets/sprites/tumbleweed.png?inline";

/**
 * Quick Draw's sprites, from games/quick-draw/assets/sprites (CC0 and drawn-from-scratch art on
 * the desert palette, see CREDITS.md). They are a few hundred bytes each, so `?inline` bundles
 * them as data URIs with the scene: no extra requests, and the CSP already allows `data:` images.
 */

interface SpriteSource {
  key: string;
  url: string;
  /** Animation frame size. Omit for a single image. */
  frame?: { width: number; height: number };
}

const tile = { width: 16, height: 16 } as const;

/** Texture keys carry the game id: every game shares Phaser's texture manager. */
export const sprites = {
  cactusBarrel: { key: "quick-draw:cactus-barrel", url: cactusBarrel },
  cactusSaguaro: { key: "quick-draw:cactus-saguaro", url: cactusSaguaro },
  /** 3 frames: wings up, wings level, perched. */
  crow: { key: "quick-draw:crow", url: crow, frame: tile },
  /** 4 frames, growing. */
  dustPuff: { key: "quick-draw:dust-puff", url: dustPuff, frame: tile },
  street: { key: "quick-draw:ground-sand-speckled", url: groundSandSpeckled },
  mesa: { key: "quick-draw:mesa", url: mesa },
  /** 3 frames: the popgun, the cork popping, the BANG! flag out. */
  popgun: { key: "quick-draw:popgun-bang", url: popgunBang, frame: tile },
  /** 3 frames. */
  sparkle: { key: "quick-draw:popgun-sparkle", url: popgunSparkle, frame: tile },
  rockBoulder: { key: "quick-draw:rock-boulder", url: rockBoulder },
  rockPile: { key: "quick-draw:rock-pile", url: rockPile },
  /** 4 frames, rolling. */
  tumbleweed: { key: "quick-draw:tumbleweed", url: tumbleweed, frame: tile },
} as const satisfies Record<string, SpriteSource>;

/** Popgun frames. */
export const popgunFrame = { gun: 0, pop: 1, flag: 2 } as const;

/** Crow frames by the presentation's crow frame: 0 perched, 1 wings up, 2 wings down. */
export const crowFrames = [2, 0, 1] as const;

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
