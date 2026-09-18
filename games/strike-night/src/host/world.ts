/**
 * The alley, built from the CC0/hand-drawn sprites in games/strike-night/assets/sprites (CC-12.5,
 * see CREDITS.md and docs/games/strike-night.md, "CC0 asset shortlist"). Sprites are small and
 * reused/tiled rather than pre-rendered per size or per lane position (the story's budget note):
 * one 8x8 board tile repeats across the pin-shot deck, one ball texture and one pin texture are
 * scaled per shot instead of drawn at every size, and the seating area is a handful of 16x16
 * furniture tiles instead of one big scene. The approach shot's lane and gutters are perspective
 * trapezoids, so they're a plank fill drawn with `Graphics` (see `plankSurface`) rather than a
 * tiled texture: Phaser 4's `GeometryMask` only clips in the Canvas renderer (`Mask.setMask`'s own
 * warning says so), and `Graphics` renders identically on both. This file owns the positioning and
 * camera-cut logic these sprites drop into; only the pin shot's deck and the approach shot's lane
 * are ever visible at once, toggled by `Presentation.shot`.
 */
import { toPhaserColor } from "@couchcade/theme";
import { buildWorldPip, drawWorldPipMarker, worldPipOrigin, worldPipSize } from "@couchcade/stage";
import type { WorldPipFace, WorldPipLook } from "@couchcade/stage";
import { Math as PhaserMath } from "phaser";
import type { GameObjects, Scene } from "phaser";
import { ceilingHeight, foulLineY, targetArrowCount, targetArrowsY, toApproach } from "./layout.ts";
import type { ScreenPoint } from "./layout.ts";
import { ballRollFrame, sprites } from "./sprites.ts";
import type { BallView, PinView, PipView, Shot } from "./present.ts";
import {
  kickbackLeftX,
  kickbackMaxY,
  kickbackRightX,
  laneCenterX,
  laneMaxX,
  laneMinX,
} from "../shared/constants.ts";

/** The `alley` scene palette (`packages/theme/src/scenes/strike-night.ts`), by name. */
const dusk = "#33397A" as const;
const walnut = "#B8743F" as const;
const maple = "#E0A15E" as const;

/** Depths inside the world. Things nearer the couch draw on top. */
const depth = {
  ceiling: -20,
  lights: -19,
  lane: -10,
  gutter: -10,
  arrows: -9,
  bench: -5,
  deck: -10,
  pit: -11,
  pin: 10,
  pip: 20,
  ball: 30,
} as const;

/** The far edge of the approach shot's lane trapezoid: past the kickbacks, into the deck. */
const farY = kickbackMaxY;

/** One side's gutter trapezoid, from the lane edge out to its kickback. */
function gutterCorners(nearX: number, farX: number): ScreenPoint[] {
  return [
    toApproach({ x: nearX, y: 0 }),
    toApproach({ x: farX, y: 0 }),
    toApproach({ x: farX, y: farY }),
    toApproach({ x: nearX, y: farY }),
  ];
}

/** The lane's four corners in the approach shot, foul line to the far edge. */
function laneCorners(): ScreenPoint[] {
  return [
    toApproach({ x: laneMinX, y: 0 }),
    toApproach({ x: laneMaxX, y: 0 }),
    toApproach({ x: laneMaxX, y: farY }),
    toApproach({ x: laneMinX, y: farY }),
  ];
}

/** A point `t` (0..1) of the way from `a` to `b`. */
function lerpPoint(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * A board-plank surface for a lane/gutter trapezoid: a flat fill plus `seams` converging board
 * lines (perspective-correct, since they interpolate the same near/far corners the trapezoid
 * itself uses) -- real "boards", not a tiled texture. `Display.Masks.GeometryMask` only works in
 * Phaser 4's Canvas renderer (`Mask.setMask`'s own warning: WebGL needs a Filter instead), so this
 * draws the grain with `Graphics` rather than mask a `TileSprite`, which renders identically on
 * both renderers.
 */
function plankSurface(
  scene: Scene,
  corners: readonly ScreenPoint[],
  fill: `#${string}`,
  seams: number,
  tileDepth: number,
): GameObjects.GameObject[] {
  const [nearLeft, nearRight, farRight, farLeft] = corners;
  if (!nearLeft || !nearRight || !farRight || !farLeft) return [];
  const points = corners.map((point) => new PhaserMath.Vector2(point.x, point.y));

  const surface = scene.add.graphics().setDepth(tileDepth);
  surface.fillStyle(toPhaserColor(fill));
  surface.fillPoints(points, true);

  const grain = scene.add.graphics().setDepth(tileDepth + 1);
  grain.lineStyle(1, toPhaserColor(walnut), 0.6);
  for (let i = 1; i < seams; i++) {
    const t = i / seams;
    const near = lerpPoint(nearLeft, nearRight, t);
    const far = lerpPoint(farLeft, farRight, t);
    grain.lineBetween(near.x, near.y, far.x, far.y);
  }

  const outline = scene.add.graphics().setDepth(tileDepth + 2);
  outline.lineStyle(2, toPhaserColor(walnut));
  outline.strokePoints(points, true);

  return [surface, grain, outline];
}

/** The approach shot's static scenery: lane, gutters, foul line, ceiling and target arrows. */
function buildApproachBackdrop(scene: Scene): GameObjects.Container {
  const objects: GameObjects.GameObject[] = [];
  const { add } = scene;
  const horizonY = toApproach({ x: laneCenterX, y: farY }).y;

  objects.push(
    add
      .rectangle(0, 0, 480, Math.max(0, horizonY - ceilingHeight), toPhaserColor(dusk))
      .setOrigin(0)
      .setDepth(depth.ceiling),
  );
  // Two ceiling lights, evenly spread over the ceiling band (one small sprite, reused).
  for (const x of [140, 340]) {
    objects.push(
      add
        .image(x, Math.max(6, horizonY - ceilingHeight), sprites.ceilingLight.key)
        .setDepth(depth.lights),
    );
  }

  objects.push(...plankSurface(scene, laneCorners(), maple, 7, depth.lane));
  objects.push(
    ...plankSurface(scene, gutterCorners(kickbackLeftX, laneMinX), walnut, 3, depth.gutter),
  );
  objects.push(
    ...plankSurface(scene, gutterCorners(laneMaxX, kickbackRightX), walnut, 3, depth.gutter),
  );

  const [nearLeft, nearRight] = laneCorners();
  const foulLine = add.graphics().setDepth(depth.lane + 3);
  foulLine.fillStyle(toPhaserColor(walnut));
  foulLine.fillRect(nearLeft?.x ?? 0, foulLineY - 1, (nearRight?.x ?? 0) - (nearLeft?.x ?? 0), 2);
  objects.push(foulLine);

  for (let i = 0; i < targetArrowCount; i++) {
    const t = (i + 0.5) / targetArrowCount;
    const at = toApproach({ x: laneMinX + t * (laneMaxX - laneMinX), y: targetArrowsY });
    objects.push(add.image(at.x, at.y, sprites.targetArrow.key).setDepth(depth.arrows));
  }

  return scene.add.container(0, 0, objects);
}

/** The pin shot's static scenery: the deck (tiled the same board texture as the lane) and the pit
 * past the back row. */
function buildPinShotBackdrop(scene: Scene): GameObjects.Container {
  const { add } = scene;
  const objects: GameObjects.GameObject[] = [
    add.rectangle(0, 0, 480, 96, toPhaserColor(dusk)).setOrigin(0).setDepth(depth.pit),
    add.rectangle(80, 96, 320, 174, toPhaserColor(walnut)).setOrigin(0).setDepth(depth.deck),
    add
      .tileSprite(84, 100, 312, 166, sprites.lanePlank.key)
      .setOrigin(0)
      .setDepth(depth.deck + 1),
  ];
  return scene.add.container(0, 0, objects);
}

/** The seating area, lower left of the approach shot: a tiled bench plus a chair, a small table, a
 * potted plant and a framed picture (Kenney's Roguelike Indoors pack, recoloured onto `alley`; see
 * CREDITS.md), for the players not bowling. */
function buildBench(scene: Scene): GameObjects.Container {
  const { add } = scene;
  const objects: GameObjects.GameObject[] = [];
  const benchY = 232;
  for (let i = 0; i < 4; i++) {
    objects.push(
      add
        .image(4 + i * 16, benchY, sprites.bench.key)
        .setOrigin(0)
        .setDepth(depth.bench),
    );
  }
  objects.push(add.image(68, benchY, sprites.chair.key).setOrigin(0).setDepth(depth.bench));
  objects.push(add.image(84, 216, sprites.pictureFrame.key).setOrigin(0).setDepth(depth.bench));
  objects.push(add.image(100, benchY, sprites.table.key).setOrigin(0).setDepth(depth.bench));
  objects.push(
    add
      .image(116, benchY - 4, sprites.pottedPlant.key)
      .setOrigin(0)
      .setDepth(depth.bench),
  );
  return scene.add.container(0, 0, objects);
}

export class LaneBackdrop {
  readonly #approach: GameObjects.Container;
  readonly #pin: GameObjects.Container;
  readonly #bench: GameObjects.Container;

  constructor(scene: Scene) {
    this.#approach = buildApproachBackdrop(scene);
    this.#pin = buildPinShotBackdrop(scene);
    this.#bench = buildBench(scene);
  }

  setShot(shot: Shot): void {
    this.#approach.setVisible(shot === "approach");
    this.#pin.setVisible(shot === "pin");
    this.#bench.setVisible(shot === "approach");
  }
}

/** The ball: the CC0/hand-drawn sprite (assets/sprites/ball.png), scaled per shot instead of
 * pre-rendered per size, cycling its 4 roll frames by distance travelled. */
export class BallActor {
  readonly #image: GameObjects.Image;
  #distance = 0;
  #last: ScreenPoint | null = null;

  constructor(scene: Scene) {
    this.#image = scene.add.image(0, 0, sprites.ball.key, 0).setDepth(depth.ball).setVisible(false);
  }

  hide(): void {
    this.#image.setVisible(false);
    this.#last = null;
    this.#distance = 0;
  }

  show(view: BallView): void {
    if (this.#last !== null) {
      this.#distance += Math.hypot(view.x - this.#last.x, view.y - this.#last.y);
    }
    this.#last = { x: view.x, y: view.y };
    this.#image
      .setPosition(view.x, view.y)
      .setDisplaySize(view.size, view.size)
      .setFrame(ballRollFrame(this.#distance))
      .setVisible(true);
  }
}

/** One pin: the CC0/hand-drawn sprite (assets/sprites/pin.png), rotated 90deg to show a fallen pin
 * instead of a separate tumble frame -- cheaper than pre-rendering every fall angle, and reads
 * fine at this size. A short tween sells the fall the moment a pin goes down. */
class PinActor {
  readonly #scene: Scene;
  readonly #image: GameObjects.Image;
  #down: boolean | null = null;

  constructor(scene: Scene) {
    this.#scene = scene;
    this.#image = scene.add.image(0, 0, sprites.pin.key).setDepth(depth.pin).setVisible(false);
  }

  hide(): void {
    this.#image.setVisible(false);
    this.#down = null;
  }

  show(view: PinView): void {
    const w = view.down ? view.size.height : view.size.width;
    const h = view.down ? view.size.width : view.size.height;
    const justFell = this.#down === false && view.down;
    this.#down = view.down;
    this.#image.setPosition(view.x, view.y).setDisplaySize(w, h).setVisible(true);
    if (justFell) {
      this.#image.setAngle(0);
      this.#scene.tweens.add({ targets: this.#image, angle: 90, duration: 150 });
    } else {
      this.#image.setAngle(view.down ? 90 : 0);
    }
  }
}

/** A pool of pin actors, one per pin id seen so far, reused every frame. */
export class PinPool {
  readonly #scene: Scene;
  readonly #actors = new Map<string, PinActor>();

  constructor(scene: Scene) {
    this.#scene = scene;
  }

  update(views: readonly PinView[]): void {
    const shown = new Set(views.map((view) => view.id));
    for (const [id, actor] of this.#actors) if (!shown.has(id)) actor.hide();
    for (const view of views) {
      let actor = this.#actors.get(view.id);
      if (actor === undefined) {
        actor = new PinActor(this.#scene);
        this.#actors.set(view.id, actor);
      }
      actor.show(view);
    }
  }
}

/** A bowler or bench player: a World Pip (CC-6.4), with its seat's shape marker at its feet, and
 * the ball sprite held up in front of them while `holding` is true (the bowler's ball-holding
 * prop; reuses the same texture as `BallActor` instead of a dedicated sprite). */
class PipActor {
  readonly #image: GameObjects.Image;
  readonly #marker: GameObjects.Graphics;
  readonly #ball: GameObjects.Image;
  readonly #slot: number;
  #key: string;

  constructor(scene: Scene, slot: number, key: string) {
    this.#slot = slot;
    this.#key = key;
    this.#marker = scene.add
      .graphics()
      .setDepth(depth.pip - 1)
      .setVisible(false);
    this.#image = scene.add.image(0, 0, key).setOrigin(0).setDepth(depth.pip).setVisible(false);
    this.#ball = scene.add
      .image(0, 0, sprites.ball.key, 0)
      .setDepth(depth.pip + 1)
      .setDisplaySize(8, 8)
      .setVisible(false);
  }

  hide(): void {
    this.#image.setVisible(false);
    this.#marker.setVisible(false);
    this.#ball.setVisible(false);
  }

  show(view: PipView, key: string): void {
    if (key !== this.#key) {
      this.#key = key;
      this.#image.setTexture(key);
    }
    const origin = worldPipOrigin(view.x, view.y);
    this.#image.setPosition(origin.x, origin.y).setVisible(true);
    this.#marker.clear().setVisible(true);
    drawWorldPipMarker(this.#marker, this.#slot, view.x, view.y);
    this.#ball.setPosition(view.x, view.y - worldPipSize.height * 0.6).setVisible(view.holding);
  }
}

/** A pool of Pip actors by player id, one per player seen so far, reused every frame. */
export class PipPool {
  readonly #scene: Scene;
  readonly #actors = new Map<string, PipActor>();
  readonly #slotOf: (id: string) => number;
  readonly #lookOf: (id: string) => WorldPipLook;

  constructor(scene: Scene, slotOf: (id: string) => number, lookOf: (id: string) => WorldPipLook) {
    this.#scene = scene;
    this.#slotOf = slotOf;
    this.#lookOf = lookOf;
  }

  update(views: readonly PipView[]): void {
    const shown = new Set(views.map((view) => view.id));
    for (const [id, actor] of this.#actors) if (!shown.has(id)) actor.hide();
    for (const view of views) {
      const face: WorldPipFace = { expression: "neutral" };
      const key = buildWorldPip(this.#scene, this.#lookOf(view.id), face);
      let actor = this.#actors.get(view.id);
      if (actor === undefined) {
        actor = new PipActor(this.#scene, this.#slotOf(view.id), key);
        this.#actors.set(view.id, actor);
      }
      actor.show(view, key);
    }
  }
}

export const pipSize = worldPipSize;
