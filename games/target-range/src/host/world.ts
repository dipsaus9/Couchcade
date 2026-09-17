import { motion, toPhaserColor, world } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { drawPlayerShape } from "@couchcade/stage/draw";
import type { GameObjects, Scene } from "phaser";
import { art, sprites } from "./art.ts";
import { placeShapes } from "./label-layout.ts";
import type { Box } from "./label-layout.ts";
import {
  bowPoint,
  crosshairBox,
  crosshairCentre,
  crosshairShapeBox,
  crosshairSize,
  flagFrame,
  horizonY,
  shapeBounds,
  standAt,
} from "./layout.ts";
import type {
  CrosshairPresentation,
  FlyingArrowPresentation,
  PipPresentation,
  Presentation,
  StuckArrowPresentation,
  WindPresentation,
} from "./present.ts";
import { worldPip, worldPipKey, worldPipSize } from "./world-pip.ts";
import type { WorldPipLook } from "./world-pip.ts";

/**
 * The range, built from the sprites in games/target-range/assets (HOUSE_STYLE "Game worlds": pixel
 * art on the core colours plus the `range` palette, 1px Ink outlines on characters and props, none
 * on the background). Every sprite sits on whole world pixels. Only the player-coloured things are
 * painted here: the World Pips, the crosshairs, and the arrows' fletching in the player's colour.
 */

/** Pixels of a texture, one row at a time. `null` is transparent. */
type PixelFn = (x: number, y: number) => Hex | null;

const rgb = (hex: Hex): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** Paints a texture once. Textures outlive a scene, so a second match reuses them. */
function paint(scene: Scene, key: string, width: number, height: number, pixel: PixelFn): string {
  const { textures } = scene;
  if (textures.exists(key)) return key;
  const texture = textures.createCanvas(key, width, height);
  if (texture === null) throw new Error(`Couldn't create the texture ${key}`);
  const image = texture.context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hex = pixel(x, y);
      if (hex === null) continue;
      const [r, g, b] = rgb(hex);
      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  texture.context.putImageData(image, 0, 0);
  texture.refresh();
  return key;
}

/** A colour channel as two hex digits. */
const hexByte = (value: number): string => value.toString(16).toUpperCase().padStart(2, "0");

/**
 * A loaded sprite's pixels, read once. `null` is transparent. The sprites are on the palette, so
 * every pixel is an exact palette colour.
 */
function spritePixels(scene: Scene, key: string): { width: number; pixel: PixelFn } {
  const source = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const { width, height } = source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("No 2D context");
  context.drawImage(source, 0, 0);
  const data = context.getImageData(0, 0, width, height).data;
  return {
    width,
    pixel: (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      const i = (y * width + x) * 4;
      if ((data[i + 3] ?? 0) < 128) return null;
      return `#${hexByte(data[i] ?? 0)}${hexByte(data[i + 1] ?? 0)}${hexByte(data[i + 2] ?? 0)}` as Hex;
    },
  };
}

/** A sprite with its fletching in `fletch`, so every arrow shows whose it is. */
function fletched(pixel: PixelFn, fletch: Hex): PixelFn {
  return (x, y) => {
    const own = pixel(x, y);
    return own === art.fletching ? fletch : own;
  };
}

/** Depths inside the world. Things nearer the front draw on top. */
const depth = {
  backdrop: -10,
  bales: -5,
  stand: 10,
  face: 11,
  flag: 12,
  stub: 30,
  arrowShape: 31,
  pip: 50,
  flying: 60,
  crosshair: 100,
} as const;

const tile = 16;

/** The mown stripes, from the far end to the front: taller towards the couch, for depth. */
const stripeHeights = [16, 24, 32, 40, 48, 30] as const;

/** Pine trees behind the hedge: x of each tree's left edge and how far it sinks into the hedge. */
const pines: readonly [x: number, sink: number][] = [
  [10, 6],
  [34, 10],
  [58, 4],
  [134, 8],
  [236, 10],
  [304, 6],
  [398, 4],
  [424, 10],
  [452, 6],
];

/** The side fences run from the front corners of the range up to the hedge. */
const fenceFront = { x: 6, y: 170 } as const;
const fenceBack = { x: 102, y: 98 } as const;
const sidePostStepPx = 12;
const fencePostStepPx = 12;
const backFenceY = 98;

/**
 * The mown range: sky, pine trees and a hedge at the far end, a wall of hay bales behind the
 * target, grass in mown stripes and a low wooden fence down each side.
 */
export function buildBackdrop(scene: Scene): void {
  const { add } = scene;
  add
    .rectangle(0, 0, world.width, horizonY, toPhaserColor(art.sky))
    .setOrigin(0)
    .setDepth(depth.backdrop);

  let top = horizonY;
  stripeHeights.forEach((height, index) => {
    const key = index % 2 === 0 ? sprites.grass.key : sprites.grassLight.key;
    add
      .tileSprite(0, top, world.width, height, key)
      .setOrigin(0)
      .setTilePosition(index * 5, top)
      .setDepth(depth.backdrop);
    top += height;
  });

  for (const [x, sink] of pines) {
    add
      .image(x, horizonY - tile + 4 + sink, sprites.pineTree.key)
      .setOrigin(0, 1)
      .setDepth(depth.backdrop + 1);
  }
  // Bushes 12 px apart overlap into one lumpy hedge.
  for (let x = -6; x < world.width; x += 12) {
    const lift = (x / 12) % 3 === 0 ? 1 : 0;
    add
      .image(x, horizonY + 3 - lift, sprites.hedgeBush.key)
      .setOrigin(0, 1)
      .setDepth(depth.backdrop + 2);
  }

  // Hay bales behind the target, where stray arrows end up.
  for (let x = 112; x < 368; x += 32) {
    add
      .image(x, horizonY + 14, sprites.hayBale.key)
      .setOrigin(0, 1)
      .setDepth(depth.bales);
  }

  // The back fence, either side of the bales: posts 12 px apart join their rails.
  for (let x = -4; x < world.width; x += fencePostStepPx) {
    if (x > 100 && x < 368) continue;
    add
      .image(x, backFenceY, sprites.fence.key)
      .setOrigin(0, 1)
      .setDepth(depth.bales - 1);
  }
  // The side fences' posts, from the back corners to the front, so nearer posts draw on top.
  const posts = Math.floor((fenceBack.x - fenceFront.x) / sidePostStepPx);
  for (let i = posts; i >= 0; i--) {
    const x = fenceFront.x + i * sidePostStepPx;
    const y = Math.round(
      fenceFront.y +
        ((fenceBack.y - fenceFront.y) * (x - fenceFront.x)) / (fenceBack.x - fenceFront.x),
    );
    for (const side of [1, -1] as const) {
      const left = side === 1 ? x - 4 : world.width - x - 12;
      add
        .image(left, y, sprites.fence.key)
        .setOrigin(0, 1)
        .setCrop(4, 0, 8, tile)
        .setDepth(depth.bales + y / 1000);
    }
  }
}

/** Target face sprites by round radius. */
const faces: Readonly<Record<number, string>> = {
  36: sprites.faceNear.key,
  30: sprites.faceMiddle.key,
  24: sprites.faceFar.key,
};

/** Wind flag sprites by strength 0 to 4: limp, light, stiff, then flapping for 3 and 4. */
const flags = [
  sprites.flagCalm.key,
  sprites.flagLight.key,
  sprites.flagStiff.key,
  sprites.flagFlapping.key,
  sprites.flagFlapping.key,
] as const;

/** True on the crosshair's four ticks: 4 px long, ending 2 px from the centre. */
function tick(x: number, y: number): boolean {
  const dx = Math.abs(x - crosshairCentre);
  const dy = Math.abs(y - crosshairCentre);
  return (dx === 0 && dy >= 2 && dy <= 5) || (dy === 0 && dx >= 2 && dx <= 5);
}

/**
 * A 15×15 crosshair: a ring of 1 px of the player's colour inside 1 px of Ink, and four short
 * outlined ticks towards the middle that leave a 3×3 gap, so the target shows through.
 */
function crosshairTexture(scene: Scene, fill: Hex): string {
  return paint(scene, `target-range:crosshair:${fill}`, crosshairSize, crosshairSize, (x, y) => {
    const distance = Math.hypot(x - crosshairCentre, y - crosshairCentre);
    if (distance > 6.5 && distance <= 7.5) return art.outline;
    if (distance > 5.5 && distance <= 6.5) return fill;
    if (tick(x, y)) return fill;
    const nearTick = tick(x - 1, y) || tick(x + 1, y) || tick(x, y - 1) || tick(x, y + 1);
    return nearTick && distance <= 5.5 ? art.outline : null;
  });
}

/** The arrow sprite's rows and columns: fletching, shaft and the two head columns. */
const arrowSprite = { top: 2, rows: 3, fletching: 0, shaft: [1, 2, 3, 4], head: [5, 6] } as const;

/**
 * A flying arrow with the player's fletching, facing right. Size 2 is the whole 7×3 sprite; the
 * smaller sizes drop shaft columns (5×3, then 3×3) as the arrow flies away from the couch.
 */
function arrowTexture(scene: Scene, fletch: Hex, size: 0 | 1 | 2): string {
  const key = `target-range:arrow:${fletch}:${size}`;
  if (scene.textures.exists(key)) return key;
  const { pixel } = spritePixels(scene, sprites.arrow.key);
  const columns = [
    arrowSprite.fletching,
    ...arrowSprite.shaft.slice(0, 2 * size),
    ...arrowSprite.head,
  ];
  const coloured = fletched(pixel, fletch);
  return paint(scene, key, columns.length, arrowSprite.rows, (x, y) =>
    coloured(columns[x] ?? -1, arrowSprite.top + y),
  );
}

/** The stub sprite's pixel that goes on the landing pixel: the shaft's bottom right. */
const stubLanding = { x: 4, y: 4 } as const;

/**
 * A stuck arrow seen end on, with the player's fletching. The shaft gets the house style's 1px Ink
 * outline, which joins the four fletching pixels into a square that stands out on every band.
 */
function stubTexture(scene: Scene, fletch: Hex): string {
  const key = `target-range:stub:${fletch}`;
  if (scene.textures.exists(key)) return key;
  const { width, pixel } = spritePixels(scene, sprites.stub.key);
  const shaft = (x: number, y: number) => pixel(x, y) === art.wood;
  const coloured = fletched(pixel, fletch);
  return paint(scene, key, width, width, (x, y) => {
    const own = coloured(x, y);
    if (own !== null) return own;
    return shaft(x - 1, y) || shaft(x + 1, y) || shaft(x, y - 1) || shaft(x, y + 1)
      ? art.outline
      : null;
  });
}

/** A player's shape as a world graphics object whose top-left corner is its position. */
function shapeGraphics(scene: Scene, look: WorldPipLook, depthValue: number): GameObjects.Graphics {
  const graphics = scene.add.graphics().setDepth(depthValue).setVisible(false);
  drawPlayerShape(graphics, look.shape, look.jersey, 0, 0);
  return graphics;
}

/** One player in a front corner: their World Pip with a bow, and their shape at their feet. */
class PipActor {
  readonly body: GameObjects.Image;
  readonly bow: GameObjects.Image;
  readonly #scene: Scene;
  readonly #look: WorldPipLook;

  constructor(scene: Scene, pip: PipPresentation, look: WorldPipLook) {
    this.#scene = scene;
    this.#look = look;
    const { x, feetY, facing } = pip.slot;
    const marker = scene.add.graphics().setDepth(depth.pip - 1);
    drawPlayerShape(marker, look.shape, look.jersey, x - 5, feetY);
    this.body = scene.add
      .image(x - worldPipSize.width / 2, feetY - worldPipSize.height, this.#texture(pip))
      .setOrigin(0)
      .setFlipX(facing === -1)
      .setDepth(depth.pip);
    // The bow sprite's limbs bend to the left: flip it for a Pip shooting to the right.
    this.bow = scene.add
      .image(0, 0, sprites.bow.key)
      .setOrigin(0.5)
      .setFlipX(facing === 1)
      .setDepth(depth.pip + 1);
  }

  #texture(pip: PipPresentation): string {
    const face = { expression: pip.expression, blink: pip.blink };
    const key = `target-range:pip:${worldPipKey(this.#look, face)}`;
    if (this.#scene.textures.exists(key)) return key;
    const grid = worldPip(this.#look, face);
    return paint(
      this.#scene,
      key,
      worldPipSize.width,
      worldPipSize.height,
      (x, y) => grid[y]?.[x] ?? null,
    );
  }

  update(pip: PipPresentation): void {
    this.body.setTexture(this.#texture(pip));
    const bow = bowPoint(pip.slot, pip.bowRaised);
    this.bow.setPosition(bow.x, bow.y);
  }
}

/** A player's look by id, from the host's seats. */
export type LookOf = (playerId: string) => WorldPipLook;

/**
 * Everything in the world that changes: the target and the flag, the Pips, crosshairs and arrows.
 * `update` shows one presentation; it only moves, shows and hides objects made in advance.
 */
export class RangeWorld {
  readonly #scene: Scene;
  readonly #lookOf: LookOf;
  readonly stand: GameObjects.Image;
  readonly target: GameObjects.Image;
  readonly flag: GameObjects.Sprite;
  readonly #pips: PipActor[];
  readonly #crosshairs = new Map<
    string,
    { ring: GameObjects.Image; shape: GameObjects.Graphics }
  >();
  readonly #flying = new Map<string, GameObjects.Image>();
  readonly #arrowShapes = new Map<string, GameObjects.Graphics>();
  readonly #stubs: GameObjects.Image[] = [];
  /** Game time each player's crosshair first showed this match, for the one-time pop. */
  readonly #firstSeenMs = new Map<string, number>();
  #shapeBoxes: Box[] = [];

  constructor(scene: Scene, view: Presentation, lookOf: LookOf) {
    this.#scene = scene;
    this.#lookOf = lookOf;
    buildBackdrop(scene);
    this.stand = scene.add.image(0, 0, sprites.stand.key).setOrigin(0).setDepth(depth.stand);
    // The face's centre pixel is the middle pixel of its odd-sized circle.
    this.target = scene.add.image(0, 0, faceKey(view.target.radius)).setDepth(depth.face);
    this.flag = scene.add.sprite(0, 0, flags[0], 0).setDepth(depth.flag);
    this.#pips = view.pips.map((pip) => new PipActor(scene, pip, lookOf(pip.id)));
    for (const [seat, pip] of view.pips.entries()) {
      const look = lookOf(pip.id);
      this.#crosshairs.set(pip.id, {
        ring: scene.add
          .image(0, 0, crosshairTexture(scene, look.jersey))
          .setOrigin(0)
          .setDepth(depth.crosshair + 2 * seat)
          .setVisible(false),
        shape: shapeGraphics(scene, look, depth.crosshair + 2 * seat + 1),
      });
      this.#arrowShapes.set(pip.id, shapeGraphics(scene, look, depth.arrowShape));
      this.#flying.set(
        pip.id,
        scene.add
          .image(0, 0, arrowTexture(scene, look.jersey, 2))
          .setOrigin(0.5)
          .setDepth(depth.flying)
          .setVisible(false),
      );
    }
  }

  /** The boxes of the shapes next to the newest stuck arrows, in world px, from the last update. */
  get arrowShapeBoxes(): readonly Box[] {
    return this.#shapeBoxes;
  }

  /** Each player's crosshair ring and shape, by player id. */
  get crosshairs(): ReadonlyMap<string, { ring: GameObjects.Image; shape: GameObjects.Graphics }> {
    return this.#crosshairs;
  }

  /** The stub images in use, visible or not. */
  get stubs(): readonly GameObjects.Image[] {
    return this.#stubs;
  }

  update(view: Presentation, reducedMotion: boolean, nowMs: number): void {
    this.#showTarget(view);
    this.#showFlag(view.wind);
    view.pips.forEach((pip, index) => this.#pips[index]?.update(pip));
    this.#showCrosshairs(view.crosshairs, reducedMotion, nowMs);
    this.#showFlying(view.flying);
    this.#showStuck(view.stuck);
  }

  #showTarget(view: Presentation): void {
    const { x, y, radius } = view.target;
    const at = standAt(view.target);
    this.stand.setPosition(at.x, at.y);
    const key = faceKey(radius);
    if (this.target.texture.key !== key) this.target.setTexture(key);
    // The origin is the centre pixel's top-left corner, so that pixel is the target centre's.
    const half = Math.floor(this.target.width / 2);
    this.target.setOrigin(half / this.target.width, half / this.target.height).setPosition(x, y);
  }

  #showFlag(wind: WindPresentation): void {
    const flipped = wind.direction === -1;
    const poleX = flipped ? flagFrame.size - flagFrame.poleX - 2 : flagFrame.poleX;
    this.flag
      .setTexture(flags[wind.strength] ?? flags[0], wind.frame)
      .setFlipX(flipped)
      .setOrigin(poleX / flagFrame.size, flagFrame.poleBottom / flagFrame.size)
      .setPosition(wind.foot.x, wind.foot.y);
  }

  #showCrosshairs(
    crosshairs: readonly CrosshairPresentation[],
    reducedMotion: boolean,
    nowMs: number,
  ): void {
    const shown = new Set(crosshairs.map((crosshair) => crosshair.id));
    for (const [id, actor] of this.#crosshairs) {
      if (!shown.has(id)) {
        actor.ring.setVisible(false);
        actor.shape.setVisible(false);
      }
    }
    for (const crosshair of crosshairs) {
      const actor = this.#crosshairs.get(crosshair.id);
      if (!actor) continue;
      const firstMs = this.#firstSeenMs.get(crosshair.id) ?? nowMs;
      this.#firstSeenMs.set(crosshair.id, firstMs);
      // The shape pops once, the first time this player's crosshair shows in the match.
      const popping = !reducedMotion && nowMs - firstMs < motion.ui.ms;
      const box = crosshairBox(crosshair);
      const shape = crosshairShapeBox(crosshair);
      actor.ring.setVisible(true).setPosition(box.left, box.top);
      actor.shape.setVisible(true).setPosition(shape.left, shape.top - (popping ? 2 : 0));
    }
  }

  #showFlying(flying: readonly FlyingArrowPresentation[]): void {
    const shown = new Set(flying.map((arrow) => arrow.id));
    for (const [id, image] of this.#flying) if (!shown.has(id)) image.setVisible(false);
    for (const arrow of flying) {
      const image = this.#flying.get(arrow.id);
      if (!image) continue;
      image
        .setTexture(arrowTexture(this.#scene, this.#lookOf(arrow.id).jersey, arrow.size))
        .setFlipX(arrow.facing === -1)
        .setPosition(arrow.x + 0.5, arrow.y + 0.5)
        .setVisible(true);
    }
  }

  #showStuck(stuck: readonly StuckArrowPresentation[]): void {
    while (this.#stubs.length < stuck.length) {
      this.#stubs.push(
        this.#scene.add
          .image(0, 0, stubTexture(this.#scene, art.fletching))
          .setOrigin(0)
          .setDepth(depth.stub),
      );
    }
    this.#stubs.forEach((stub, index) => {
      const arrow = stuck[index];
      stub.setVisible(arrow !== undefined);
      if (!arrow) return;
      stub
        .setTexture(stubTexture(this.#scene, this.#lookOf(arrow.id).jersey))
        .setPosition(arrow.x - stubLanding.x, arrow.y - stubLanding.y);
    });

    const newest = stuck.filter((arrow) => arrow.newest);
    const boxes = placeShapes(newest, stuck, shapeBounds);
    this.#shapeBoxes = boxes;
    const placed = new Map(newest.map((arrow, index) => [arrow.id, boxes[index]]));
    for (const [id, shape] of this.#arrowShapes) {
      const box = placed.get(id);
      shape.setVisible(box !== undefined);
      if (box) shape.setPosition(box.left, box.top);
    }
  }
}

/** The face sprite for a round radius. */
function faceKey(radius: number): string {
  return faces[radius] ?? sprites.faceNear.key;
}
