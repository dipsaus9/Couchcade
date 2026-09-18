/**
 * The alley, built from simple pixel-grid shapes in the `alley` palette (HOUSE_STYLE "Game
 * worlds"). CC-12.5 swaps these for the CC0 pixel-art sprites in "docs/games/strike-night.md,
 * CC0 asset shortlist"; this owns the positioning and camera-cut logic those sprites drop into.
 * Only the pin shot's deck and the approach shot's lane are ever visible at once, toggled by
 * `Presentation.shot`.
 */
import { color, toPhaserColor } from "@couchcade/theme";
import { buildWorldPip, drawWorldPipMarker, worldPipOrigin, worldPipSize } from "@couchcade/stage";
import type { WorldPipFace, WorldPipLook } from "@couchcade/stage";
import { Math as PhaserMath } from "phaser";
import type { GameObjects, Scene } from "phaser";
import { ceilingHeight, foulLineY, targetArrowCount, targetArrowsY, toApproach } from "./layout.ts";
import type { ScreenPoint } from "./layout.ts";
import type { BallView, PinView, PipView, Shot } from "./present.ts";
import { kickbackMaxY, laneCenterX, laneMaxX, laneMinX } from "../shared/constants.ts";

/** The `alley` scene palette (`packages/theme/src/scenes/strike-night.ts`), by name. */
const maple = "#E0A15E" as const;
const walnut = "#B8743F" as const;
const dusk = "#33397A" as const;
const cream = "#F4E3C1" as const;

/** Depths inside the world. Things nearer the couch draw on top. */
const depth = {
  ceiling: -20,
  lane: -10,
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

/** The lane's four corners in the approach shot, foul line to the far edge. */
function laneCorners(): ScreenPoint[] {
  return [
    toApproach({ x: laneMinX, y: 0 }),
    toApproach({ x: laneMaxX, y: 0 }),
    toApproach({ x: laneMaxX, y: farY }),
    toApproach({ x: laneMinX, y: farY }),
  ];
}

/** The approach shot's static scenery: lane, foul line, ceiling and target arrows. */
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
  // Two Cream lane lights, evenly spread over the ceiling band.
  for (const x of [140, 340]) {
    objects.push(
      add
        .circle(x, Math.max(2, horizonY - ceilingHeight - 6), 3, toPhaserColor(cream))
        .setDepth(depth.ceiling + 1),
    );
  }

  const lane = add.graphics().setDepth(depth.lane);
  const corners = laneCorners();
  const points = corners.map((point) => new PhaserMath.Vector2(point.x, point.y));
  lane.fillStyle(toPhaserColor(maple));
  lane.fillPoints(points, true);
  // A 2 px Walnut board line around the lane, board lines and gutters (spec, "Scene palette").
  lane.lineStyle(2, toPhaserColor(walnut));
  lane.strokePoints(points, true);
  objects.push(lane);

  const [nearLeft, nearRight] = corners;
  const foulLine = add.graphics().setDepth(depth.lane + 1);
  foulLine.fillStyle(toPhaserColor(walnut));
  foulLine.fillRect(nearLeft?.x ?? 0, foulLineY - 1, (nearRight?.x ?? 0) - (nearLeft?.x ?? 0), 2);
  objects.push(foulLine);

  const arrows = add.graphics().setDepth(depth.arrows);
  arrows.fillStyle(toPhaserColor(color.ink));
  for (let i = 0; i < targetArrowCount; i++) {
    const t = (i + 0.5) / targetArrowCount;
    const at = toApproach({ x: laneMinX + t * (laneMaxX - laneMinX), y: targetArrowsY });
    arrows.fillTriangle(at.x, at.y - 2, at.x - 2, at.y + 1, at.x + 2, at.y + 1);
  }
  objects.push(arrows);

  return scene.add.container(0, 0, objects);
}

/** The pin shot's static scenery: the deck and the pit past the back row. */
function buildPinShotBackdrop(scene: Scene): GameObjects.Container {
  const { add } = scene;
  const objects: GameObjects.GameObject[] = [
    add.rectangle(0, 0, 480, 96, toPhaserColor(dusk)).setOrigin(0).setDepth(depth.pit),
    add.rectangle(80, 96, 320, 174, toPhaserColor(walnut)).setOrigin(0).setDepth(depth.deck),
    add
      .rectangle(84, 100, 312, 166, toPhaserColor(maple))
      .setOrigin(0)
      .setDepth(depth.deck + 1),
  ];
  return scene.add.container(0, 0, objects);
}

/** The bench, lower left of the approach shot, for the players not bowling. */
function buildBench(scene: Scene): GameObjects.Container {
  const bench = scene.add
    .rectangle(4, 232, 92, 16, toPhaserColor(walnut))
    .setOrigin(0)
    .setDepth(depth.bench);
  return scene.add.container(0, 0, [bench]);
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

/** The ball: Sky with an Ink outline, a plain circle until CC-12.5's roll frames land. */
export class BallActor {
  readonly #circle: GameObjects.Arc;
  readonly #outline: GameObjects.Arc;

  constructor(scene: Scene) {
    this.#outline = scene.add.circle(0, 0, 1, toPhaserColor(color.ink)).setDepth(depth.ball);
    this.#circle = scene.add.circle(0, 0, 1, toPhaserColor(color.sky)).setDepth(depth.ball + 1);
    this.hide();
  }

  hide(): void {
    this.#circle.setVisible(false);
    this.#outline.setVisible(false);
  }

  show(view: BallView): void {
    const r = Math.max(1, view.size / 2);
    this.#outline
      .setPosition(view.x, view.y)
      .setRadius(r + 1)
      .setVisible(true);
    this.#circle.setPosition(view.x, view.y).setRadius(r).setVisible(true);
  }
}

/** One pin: a Chalk sliver on a spot, Ink outline, tinted while falling or down. */
class PinActor {
  readonly #body: GameObjects.Rectangle;

  constructor(scene: Scene) {
    this.#body = scene.add
      .rectangle(0, 0, 1, 1, toPhaserColor(color.chalk))
      .setStrokeStyle(1, toPhaserColor(color.ink))
      .setDepth(depth.pin)
      .setVisible(false);
  }

  hide(): void {
    this.#body.setVisible(false);
  }

  show(view: PinView): void {
    this.#body
      .setPosition(view.x, view.y)
      .setSize(view.size.width, view.size.height)
      .setFillStyle(toPhaserColor(view.down ? color.ink : color.chalk))
      .setVisible(true);
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

/** A bowler or bench player: a World Pip (CC-6.4), with its seat's shape marker at its feet. */
class PipActor {
  readonly #image: GameObjects.Image;
  readonly #marker: GameObjects.Graphics;
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
  }

  hide(): void {
    this.#image.setVisible(false);
    this.#marker.setVisible(false);
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
