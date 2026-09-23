import type { Loader, Textures } from "phaser";
import ballShadow from "../../assets/sprites/ball-shadow.png?inline";
import ball from "../../assets/sprites/ball.png?inline";
import courtDeep from "../../assets/sprites/court-deep.png?inline";
import courtLine from "../../assets/sprites/court-line.png?inline";
import court from "../../assets/sprites/court.png?inline";
import floodlightPole from "../../assets/sprites/floodlight-pole.png?inline";
import glassBand from "../../assets/sprites/glass-band.png?inline";
import meshBand from "../../assets/sprites/mesh-band.png?inline";
import netBand from "../../assets/sprites/net-band.png?inline";
import racketSwing from "../../assets/sprites/racket-swing.png?inline";
import swingRing from "../../assets/sprites/swing-ring.png?inline";

/**
 * Bandeja's sprites, from games/bandeja/assets/sprites (CC0-and-drawn-from-scratch art on the
 * `padel` palette, CC-23.5, see CREDITS.md). Every file is a few hundred bytes, so `?inline`
 * bundles it as a data URI with the scene (docs/games/bandeja.md, "TV scene"): no extra requests.
 */

interface SpriteSource {
  key: string;
  url: string;
  /** Animation frame size. Omit for a single image. */
  frame?: { width: number; height: number };
}

const racketFrame = { width: 8, height: 16 } as const;

/** Texture keys carry the game id: every game shares Phaser's texture manager. */
export const sprites = {
  ball: { key: "bandeja:ball", url: ball },
  ballShadow: { key: "bandeja:ball-shadow", url: ballShadow },
  court: { key: "bandeja:court", url: court },
  courtDeep: { key: "bandeja:court-deep", url: courtDeep },
  courtLine: { key: "bandeja:court-line", url: courtLine },
  floodlightPole: { key: "bandeja:floodlight-pole", url: floodlightPole },
  glassBand: { key: "bandeja:glass-band", url: glassBand },
  meshBand: { key: "bandeja:mesh-band", url: meshBand },
  netBand: { key: "bandeja:net-band", url: netBand },
  /** 3 frames, 8×16 each: the racket swung through on a connect. */
  racketSwing: { key: "bandeja:racket-swing", url: racketSwing, frame: racketFrame },
  swingRing: { key: "bandeja:swing-ring", url: swingRing },
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
