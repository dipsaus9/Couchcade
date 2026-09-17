import { motion, world } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { drawPlayerShape } from "@couchcade/stage/draw";
import type { GameObjects, Scene } from "phaser";
import { art, bandColour } from "./art.ts";
import { placeShapes, stubSize } from "./label-layout.ts";
import type { Box } from "./label-layout.ts";
import {
  bossMarginPx,
  bowPoint,
  crosshairBox,
  crosshairCentre,
  crosshairShapeBox,
  crosshairSize,
  horizonY,
  legPx,
  poleHeightPx,
  shapeBounds,
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
 * The range, drawn in world pixels on the core colours (HOUSE_STYLE "Game worlds": 1px Ink
 * outlines on characters and props, none on the background). Until CC-11.5 brings the CC0 art,
 * every picture here is painted from a pixel function into a texture once, and the scene only
 * moves images around. CC-11.5 swaps each `paint…` texture for its sprite under the same role.
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

/** Adds a 1px Ink outline (four neighbours) around a pixel function's shape. */
function outlined(pixel: PixelFn): PixelFn {
  return (x, y) => {
    const own = pixel(x, y);
    if (own !== null) return own;
    const near = pixel(x - 1, y) ?? pixel(x + 1, y) ?? pixel(x, y - 1) ?? pixel(x, y + 1);
    return near === null ? null : art.outline;
  };
}

/** A 25% dither: one pixel of every 2×2 block. */
const dither = (x: number, y: number): boolean => x % 2 === 0 && y % 2 === 0;

/** Where the left fence rail runs: from the front corner up to the hedge. */
const fenceRailY = (x: number): number => Math.round(158 - (x * 72) / 136);
const fenceEndX = 136;

/** Depths inside the world. */
const depth = {
  backdrop: -10,
  flag: 10,
  target: 20,
  stub: 30,
  arrowShape: 31,
  pip: 50,
  flying: 60,
  crosshair: 100,
} as const;

/** The mown range: sky, trees and a hedge at the far end, grass, a low fence down each side. */
export function buildBackdrop(scene: Scene): void {
  const trees = [
    { x: 36, y: 58, r: 13 },
    { x: 150, y: 62, r: 10 },
    { x: 322, y: 60, r: 12 },
    { x: 446, y: 56, r: 14 },
  ];
  const key = paint(scene, "target-range:backdrop", world.width, world.height, (x, y) => {
    const hedgeTop = 70 + Math.round(2 * Math.sin(x / 7));
    const inTree = trees.some((tree) => (x - tree.x) ** 2 + (y - tree.y) ** 2 <= tree.r ** 2);
    if (y < horizonY && (y >= hedgeTop || inTree)) {
      return dither(x, y) ? art.hedgeShade : art.hedge;
    }
    if (y < horizonY) return art.sky;

    const mirroredX = Math.min(x, world.width - 1 - x);
    if (mirroredX <= fenceEndX) {
      const rail = fenceRailY(mirroredX);
      const post = mirroredX % 17 === 0 && y <= rail && y >= rail - 7;
      const onRail = (top: number) => y >= rail - top && y <= rail - top + 1;
      if (post || onRail(6) || onRail(3)) return art.fence;
    }
    return art.grass;
  });
  scene.add.image(0, 0, key).setOrigin(0).setDepth(depth.backdrop);
}

/**
 * The straw boss on its stand with the painted face, for a round's radius. The face is the rings
 * of the rules: ring `k` reaches `radius × (11 − k) / 10`, in five colour bands.
 */
function targetTexture(scene: Scene, radius: number): { key: string; centre: number } {
  /** The straw boss reaches this far from the face centre; its outline is one pixel further. */
  const boss = radius + bossMarginPx;
  const centre = boss + 1;
  const legs = [-Math.round(radius / 2), Math.round(radius / 2)];
  const key = paint(
    scene,
    `target-range:target:${radius}`,
    2 * centre + 1,
    2 * centre + 1 + legPx,
    outlined((px, py) => {
      const dx = px - centre;
      const dy = py - centre;
      if (Math.abs(dx) > boss) return null;
      if (dy > boss) {
        const onLeg = legs.some((leg) => dx === leg || dx === leg + Math.sign(leg));
        return onLeg && dy < boss + legPx ? art.wood : null;
      }
      if (dy < -boss) return null;
      // Round the boss's corners by one pixel.
      if (Math.abs(dx) === boss && Math.abs(dy) === boss) return null;
      const distance = Math.hypot(dx, dy);
      if (distance <= radius + 0.5) {
        const ring = Math.min(10, Math.max(1, Math.floor(11 - (10 * distance) / radius)));
        return bandColour(ring);
      }
      if (distance <= radius + 1.5) return art.outline;
      return (px * 3 + py * 5) % 11 === 0 ? art.strawSpeck : art.straw;
    }),
  );
  return { key, centre };
}

/** Flag cloth length, droop and wave by wind strength 0 to 4: limp, light, stiff, flapping. */
function flagTexture(scene: Scene, strength: number, frame: number): string {
  const kind = Math.min(3, strength);
  const width = 34;
  const height = poleHeightPx + 2;
  const pole = 16;
  const cloth = (x: number, y: number): boolean => {
    if (kind === 0) return x >= pole + 1 && x <= pole + 3 && y >= 2 && y <= 10;
    const length = [0, 7, 11, 14][kind] as number;
    const i = x - pole - 1;
    if (i < 0 || i >= length) return false;
    const droop = kind === 1 ? Math.round((3 * i) / length) : 0;
    const wave =
      kind === 3
        ? Math.round(Math.sin((i + frame * 3) / 2))
        : kind === 2 && frame === 1 && i > 7
          ? 1
          : 0;
    const top = 2 + droop + wave;
    return y >= top && y < top + 5;
  };
  return paint(
    scene,
    `target-range:flag:${kind}:${kind === 0 ? 0 : frame}`,
    width,
    height,
    (x, y) => {
      if (x === pole && y >= 1) return art.pole;
      return outlined((cx, cy) => (cloth(cx, cy) ? art.flag : null))(x, y);
    },
  );
}

/** A bow seen from behind, 5×11, facing right: the Ink stave and a Chalk string. */
const bowMask = [
  "..#..",
  "...#.",
  "..s#.",
  "..s.#",
  "..s.#",
  "..s.#",
  "..s.#",
  "..s.#",
  "..s#.",
  "...#.",
  "..#..",
];

function bowTexture(scene: Scene): string {
  return paint(scene, "target-range:bow", 5, bowMask.length, (x, y) => {
    const cell = bowMask[y]?.[x];
    return cell === "#" ? art.bow : cell === "s" ? art.bowString : null;
  });
}

/** Flying arrows, facing right: fletching in the player's colour, a Chalk shaft, an Ink head. */
const arrowMasks = [
  ["f.h", "fsh", "f.h"],
  ["f..h.", "fsssh", "f..h."],
  ["f....h.", "fsssssh", "f....h."],
] as const;

function arrowTexture(scene: Scene, fletch: Hex, size: 0 | 1 | 2): string {
  const mask = arrowMasks[size];
  return paint(scene, `target-range:arrow:${fletch}:${size}`, mask[0].length, 3, (x, y) => {
    const cell = mask[y]?.[x];
    return cell === "f"
      ? fletch
      : cell === "s"
        ? art.arrowShaft
        : cell === "h"
          ? art.arrowHead
          : null;
  });
}

/** A stuck arrow's stub: 3×3 in the player's colour around the Ink shaft, with an Ink outline. */
function stubTexture(scene: Scene, fill: Hex): string {
  return paint(
    scene,
    `target-range:stub:${fill}`,
    stubSize,
    stubSize,
    outlined((x, y) => {
      if (x < 1 || y < 1 || x > 3 || y > 3) return null;
      return x === 2 && y === 2 ? art.arrowHead : fill;
    }),
  );
}

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
    this.bow = scene.add
      .image(0, 0, bowTexture(scene))
      .setOrigin(0.5)
      .setFlipX(facing === -1)
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
    this.bow.setPosition(bow.x + (pip.slot.facing === 1 ? 0.5 : -0.5), bow.y + 0.5);
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
  readonly target: GameObjects.Image;
  readonly flag: GameObjects.Image;
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
  #targetRadius = 0;

  constructor(scene: Scene, view: Presentation, lookOf: LookOf) {
    this.#scene = scene;
    this.#lookOf = lookOf;
    buildBackdrop(scene);
    this.flag = scene.add
      .image(0, 0, flagTexture(scene, 0, 0))
      .setOrigin(16 / 34, 1)
      .setDepth(depth.flag);
    this.target = scene.add
      .image(0, 0, targetTexture(scene, view.target.radius).key)
      .setDepth(depth.target);
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
    if (radius !== this.#targetRadius) {
      const { key, centre } = targetTexture(this.#scene, radius);
      this.target.setTexture(key);
      this.#targetRadius = radius;
      this.target.setOrigin(centre / this.target.width, centre / this.target.height);
    }
    // The origin is the face centre pixel's top-left corner, so that pixel is the target's.
    this.target.setPosition(x, y);
  }

  #showFlag(wind: WindPresentation): void {
    // The pole is column 16 of 34, or 17 once mirrored. The bottom row stands on the foot.
    this.flag
      .setTexture(flagTexture(this.#scene, wind.strength, wind.frame))
      .setFlipX(wind.direction === -1)
      .setOrigin(wind.direction === -1 ? 17 / 34 : 16 / 34, 1)
      .setPosition(wind.foot.x, wind.foot.y + 1);
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
          .image(0, 0, stubTexture(this.#scene, art.outline))
          .setOrigin(0)
          .setDepth(depth.stub),
      );
    }
    this.#stubs.forEach((stub, index) => {
      const arrow = stuck[index];
      stub.setVisible(arrow !== undefined);
      if (!arrow) return;
      const half = Math.floor(stubSize / 2);
      stub
        .setTexture(stubTexture(this.#scene, this.#lookOf(arrow.id).jersey))
        .setPosition(arrow.x - half, arrow.y - half);
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
