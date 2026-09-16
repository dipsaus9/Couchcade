import { color, toPhaserColor, world } from "@couchcade/theme";
import { getScenePalette } from "@couchcade/theme/scenes";
import { drawPlayerShape } from "@couchcade/stage/draw";
import type { GameObjects, Scene } from "phaser";
import { cacti, horizonY, street } from "./layout.ts";
import type { PipPresentation } from "./present.ts";
import { crowFrames, popgunFrame, sprites } from "./sprites.ts";
import { worldPip, worldPipKey, worldPipSize } from "./world-pip.ts";
import type { WorldPipLook } from "./world-pip.ts";

/**
 * The desert street, built from the sprites in games/quick-draw/assets (HOUSE_STYLE "Game
 * worlds": pixel art on the core colours plus the desert palette, 1px Ink outlines on characters
 * and props, none on the background). Every sprite sits on whole world pixels.
 */

const tile = 16;
const sand = getScenePalette("desert").colors[0] ?? color.chalk;

/** Depths inside the world. Things nearer the front (larger y) draw on top. */
const depthOf = (bottomY: number): number => bottomY;

/** Sky, mesas on the horizon, the sandy roadside with rocks and two cacti, and the street. */
export function buildBackdrop(scene: Scene): void {
  const { add } = scene;
  add.rectangle(0, 0, world.width, horizonY, toPhaserColor(color.sky)).setOrigin(0).setDepth(-3);
  add
    .rectangle(0, horizonY, world.width, world.height - horizonY, toPhaserColor(sand))
    .setOrigin(0)
    .setDepth(-3);

  const mesas: readonly [x: number, flip: boolean][] = [
    [6, false],
    [30, true],
    [168, false],
    [196, true],
    [226, false],
    [372, true],
    [404, false],
    [430, true],
  ];
  for (const [x, flip] of mesas) {
    add.image(x, horizonY, sprites.mesa.key).setOrigin(0, 1).setFlipX(flip).setDepth(-2);
  }

  add
    .tileSprite(0, street.top, world.width, street.rows * tile, sprites.street.key)
    .setOrigin(0)
    .setDepth(-1);
  add.image(232, street.top, sprites.rockBoulder.key).setOrigin(0).setDepth(-1);
  for (const [x, y] of [
    [96, 112],
    [300, 116],
  ] as const) {
    add
      .image(x, y, sprites.rockPile.key)
      .setOrigin(0)
      .setDepth(depthOf(y + tile));
  }

  const [left, right] = cacti;
  add
    .image(left.x - tile / 2, left.baseY, sprites.cactusBarrel.key)
    .setOrigin(0, 1)
    .setDepth(depthOf(left.baseY));
  add
    .image(right.x - tile / 2, right.baseY, sprites.cactusSaguaro.key)
    .setOrigin(0, 1)
    .setDepth(depthOf(right.baseY));
}

/** Props that come and go: the tumbleweed, the crow, the popgun sparkle and the dust puff. */
export class Props {
  readonly tumbleweed: GameObjects.Sprite;
  readonly crow: GameObjects.Sprite;
  readonly sparkle: GameObjects.Sprite;
  readonly dust: GameObjects.Sprite;

  constructor(scene: Scene) {
    const sprite = (key: string, depth: number) =>
      scene.add.sprite(0, 0, key, 0).setOrigin(0).setDepth(depth).setVisible(false);
    this.tumbleweed = sprite(sprites.tumbleweed.key, 215);
    const cactus = cacti[1];
    // The bottom of the crow's body is 6px above its frame's bottom edge: it perches on the
    // cactus's top row.
    this.crow = sprite(sprites.crow.key, depthOf(cactus.baseY) + 1).setPosition(
      cactus.x - tile / 2,
      cactus.baseY - 2 * tile + 6,
    );
    this.sparkle = sprite(sprites.sparkle.key, 250);
    this.dust = sprite(sprites.dustPuff.key, 215);
  }

  /** Where the tumbleweed and the dust puff roll along, by their bottom edge. */
  static readonly groundY = 214;

  showTumbleweed(at: { x: number; frame: number } | null): void {
    this.tumbleweed.setVisible(at !== null);
    if (at) this.tumbleweed.setPosition(at.x - tile / 2, Props.groundY - tile).setFrame(at.frame);
  }

  showCrow(at: { frame: number } | null): void {
    this.crow.setVisible(at !== null);
    if (at) this.crow.setFrame(crowFrames[at.frame] ?? crowFrames[0]);
  }

  /** The sparkle's centre pixel goes on the muzzle. */
  showSparkle(muzzle: { x: number; y: number } | null, frame: number): void {
    this.sparkle.setVisible(muzzle !== null);
    if (muzzle) this.sparkle.setPosition(muzzle.x - 8, muzzle.y - 8).setFrame(frame);
  }

  showDust(at: { x: number; frame: number } | null): void {
    this.dust.setVisible(at !== null);
    if (at) this.dust.setPosition(at.x - tile / 2, Props.groundY - tile).setFrame(at.frame);
  }
}

/** Where a pixel of the 16px popgun frame lands, for a gun whose frame starts at `left`. */
const gunPixelX = (left: number, localX: number, facing: 1 | -1): number =>
  left + (facing === 1 ? localX : tile - 1 - localX);

/** The popgun frame's handle pixel, which goes in the Pip's hand. */
const handle = { x: 4, y: 10 } as const;
/** The muzzle pixel, where the glint sparkles. */
const muzzlePixel = { x: 11, y: 7 } as const;
/** The middle of the BANG! flag. */
const flagPixel = { x: 13, y: 1 } as const;

/**
 * One player on the street: their World Pip, a popgun held low until they draw, and their shape
 * on the ground under their feet, so colour always comes with shape (HOUSE_STYLE "Player
 * colours").
 */
export class PipActor {
  readonly body: GameObjects.Image;
  readonly gun: GameObjects.Image;
  readonly #scene: Scene;
  readonly #look: WorldPipLook;
  #gunLeft = 0;
  #gunTop = 0;
  #facing: 1 | -1 = 1;

  constructor(scene: Scene, pip: PipPresentation, look: WorldPipLook) {
    this.#scene = scene;
    this.#look = look;
    const { x, feetY, facing } = pip.slot;
    this.#facing = facing;
    const marker = scene.add.graphics().setDepth(depthOf(feetY) - 0.5);
    drawPlayerShape(marker, look.shape, look.jersey, x - 5, feetY);
    this.body = scene.add
      .image(x - worldPipSize.width / 2, feetY - worldPipSize.height, this.#texture(pip))
      .setOrigin(0)
      .setFlipX(facing === -1)
      .setDepth(depthOf(feetY));
    this.gun = scene.add
      .image(0, 0, sprites.popgun.key, popgunFrame.gun)
      .setOrigin(0)
      .setFlipX(facing === -1)
      .setDepth(depthOf(feetY) + 0.5);
  }

  /** The texture for this Pip's face, painted once per look and face. */
  #texture(pip: PipPresentation): string {
    const face = { expression: pip.expression, blink: pip.blink };
    const key = `quick-draw:pip:${worldPipKey(this.#look, face)}`;
    const { textures } = this.#scene;
    if (textures.exists(key)) return key;
    const texture = textures.createCanvas(key, worldPipSize.width, worldPipSize.height);
    if (texture === null) throw new Error(`Couldn't create the Pip texture ${key}`);
    worldPip(this.#look, face).forEach((row, y) =>
      row.forEach((pixel, x) => {
        if (pixel === null) return;
        texture.context.fillStyle = pixel;
        texture.context.fillRect(x, y, 1, 1);
      }),
    );
    texture.refresh();
    return key;
  }

  update(pip: PipPresentation): void {
    const { x, feetY, facing } = pip.slot;
    this.body.setTexture(this.#texture(pip));

    // The hand is just outside the jersey, on the side the Pip faces. Drawing raises the popgun
    // to chest height and pushes it forward.
    const drawn = pip.pose === "drawn";
    const handX = (facing === 1 ? x + 6 : x - 7) + (drawn ? 2 * facing : 0);
    const handY = feetY - (drawn ? 9 : 5);
    this.#facing = facing;
    this.#gunLeft = facing === 1 ? handX - handle.x : handX - (tile - 1 - handle.x);
    this.#gunTop = handY - handle.y;
    const frame =
      pip.flag === null ? popgunFrame.gun : pip.flag < 1 ? popgunFrame.pop : popgunFrame.flag;
    this.gun.setPosition(this.#gunLeft, this.#gunTop).setFrame(frame);
  }

  /** The popgun's muzzle pixel. */
  get muzzle(): { x: number; y: number } {
    return {
      x: gunPixelX(this.#gunLeft, muzzlePixel.x, this.#facing),
      y: this.#gunTop + muzzlePixel.y,
    };
  }

  /** The middle of the top of the BANG! flag. */
  get flagTop(): { x: number; y: number } {
    return {
      x: gunPixelX(this.#gunLeft, flagPixel.x, this.#facing),
      y: this.#gunTop + flagPixel.y,
    };
  }
}
