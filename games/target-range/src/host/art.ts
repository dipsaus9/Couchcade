import { color } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { getScenePalette } from "@couchcade/theme/scenes";
import type { Loader, Textures } from "phaser";
import arrowFlight from "../../assets/sprites/arrow-flight.png?inline";
import arrowStub from "../../assets/sprites/arrow-stub.png?inline";
import bow from "../../assets/sprites/bow.png?inline";
import fence from "../../assets/sprites/fence.png?inline";
import grassLight from "../../assets/sprites/grass-light.png?inline";
import grass from "../../assets/sprites/grass.png?inline";
import hayBale from "../../assets/sprites/hay-bale.png?inline";
import hedgeBush from "../../assets/sprites/hedge-bush.png?inline";
import pineTree from "../../assets/sprites/pine-tree.png?inline";
import targetFar from "../../assets/sprites/target-far.png?inline";
import targetMiddle from "../../assets/sprites/target-middle.png?inline";
import targetNear from "../../assets/sprites/target-near.png?inline";
import targetStand from "../../assets/sprites/target-stand.png?inline";
import windFlagCalm from "../../assets/sprites/wind-flag-calm.png?inline";
import windFlagFlapping from "../../assets/sprites/wind-flag-flapping.png?inline";
import windFlagLight from "../../assets/sprites/wind-flag-light.png?inline";
import windFlagStiff from "../../assets/sprites/wind-flag-stiff.png?inline";

/**
 * What Target Range's world is painted with, by role: the sprites in games/target-range/assets
 * (Kenney's CC0 Tiny Town tiles and art drawn from scratch, all on the core + `range` palette, see
 * CREDITS.md) and the few colours the scene draws itself. The sprites are a few hundred bytes to
 * 2 KB each, so `?inline` bundles them as data URIs with the scene, like Quick Draw's: no extra
 * requests, and the CSP already allows `data:` images.
 */

const range = getScenePalette("range").colors;

/** A range colour by its place in the palette (docs/games/target-range.md, "Scene palette"). */
const rangeColour = (index: number): Hex => range[index] ?? color.chalk;

export const art = {
  sky: color.sky,
  /** The mown grass: the base colour of both grass tiles. */
  grass: rangeColour(0),
  /** Arrow shafts in the arrow sprites. */
  wood: rangeColour(2),
  /** Arrow fletching in the arrow sprites, which the scene swaps for the player's colour. */
  fletching: rangeColour(3),
  outline: color.ink,
  /** The target face sprites' five bands from the edge in: white, black, blue, red, gold. */
  bands: [color.chalk, color.ink, color.sky, rangeColour(4), color.sunny],
} as const satisfies Record<string, Hex | readonly Hex[]>;

interface SpriteSource {
  key: string;
  url: string;
  /** Animation frame size. Omit for a single image. */
  frame?: { width: number; height: number };
}

const flagFrame = { width: 16, height: 16 } as const;

/** Texture keys carry the game id: every game shares Phaser's texture manager. */
export const sprites = {
  grass: { key: "target-range:grass", url: grass },
  grassLight: { key: "target-range:grass-light", url: grassLight },
  pineTree: { key: "target-range:pine-tree", url: pineTree },
  hedgeBush: { key: "target-range:hedge-bush", url: hedgeBush },
  fence: { key: "target-range:fence", url: fence },
  hayBale: { key: "target-range:hay-bale", url: hayBale },
  /** The straw boss on its wooden stand. */
  stand: { key: "target-range:target-stand", url: targetStand },
  /** Target faces by round radius (docs/games/target-range.md, "Rules and scoring"). */
  faceNear: { key: "target-range:target-near", url: targetNear },
  faceMiddle: { key: "target-range:target-middle", url: targetMiddle },
  faceFar: { key: "target-range:target-far", url: targetFar },
  /** Wind flags by strength, 3 frames each: limp, light, stiff and flapping. */
  flagCalm: { key: "target-range:wind-flag-calm", url: windFlagCalm, frame: flagFrame },
  flagLight: { key: "target-range:wind-flag-light", url: windFlagLight, frame: flagFrame },
  flagStiff: { key: "target-range:wind-flag-stiff", url: windFlagStiff, frame: flagFrame },
  flagFlapping: {
    key: "target-range:wind-flag-flapping",
    url: windFlagFlapping,
    frame: flagFrame,
  },
  bow: { key: "target-range:bow", url: bow },
  arrow: { key: "target-range:arrow-flight", url: arrowFlight },
  stub: { key: "target-range:arrow-stub", url: arrowStub },
} as const satisfies Record<string, SpriteSource>;

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
