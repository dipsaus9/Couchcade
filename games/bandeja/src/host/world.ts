import { color, toPhaserColor, world } from "@couchcade/theme";
import { buildWorldPip, drawWorldPipMarker, worldPipOrigin, worldPipSize } from "@couchcade/stage";
import type { WorldPipFace, WorldPipLook } from "@couchcade/stage";
import type { GameObjects, Scene } from "phaser";
import type { SlotName } from "../shared/index.ts";
import { sprites } from "./art.ts";
import {
  farEdgeSy,
  farGlassHeight,
  nearEdgeSy,
  netBandHeight,
  netSy,
  sideWall,
  sideWallBands,
} from "./layout.ts";
import type { PipPresentation, Presentation, RingPresentation } from "./present.ts";

/**
 * The padel court, built from the sprites in games/bandeja/assets (HOUSE_STYLE "Game worlds":
 * pixel art on the core colours plus the `padel` palette, 1px Ink outlines on characters and
 * props, none on the background). Every sprite sits on whole world pixels. Only the
 * player-coloured things (World Pips, their shape marks) are painted at runtime; the court, cage,
 * net, ball and swing ring are the CC-23.5 sprites, tiled or stamped as the layout calls for.
 */

/** Depths inside the world. Things nearer the front (closer to the couch) draw on top. */
const depth = {
  sky: -20,
  farGlass: -12,
  court: -10,
  courtDeep: -9,
  sideWalls: -8,
  floodlight: -7,
  net: -4,
  shadow: -1,
  pip: 10,
  ball: 20,
  ring: 30,
} as const;

/** A vertical band (corner glass / mesh / corner glass) on one side wall. */
function sideBand(scene: Scene, x: number, top: number, bottom: number, key: string): void {
  if (bottom <= top) return;
  scene.add
    .tileSprite(x, top, sideWall.rightOuter - sideWall.rightInner, bottom - top, key)
    .setOrigin(0)
    .setDepth(depth.sideWalls);
}

/**
 * The static court: sky, floodlights, the ground, the cage's glass and mesh bands, and the net.
 * Everything the ball, the players and the rings move over.
 */
export function buildCourt(scene: Scene): void {
  const { add } = scene;
  const courtLeft = sideWall.leftInner;
  const courtRight = sideWall.rightInner;
  const courtWidth = courtRight - courtLeft;

  add
    .rectangle(0, 0, world.width, farEdgeSy - farGlassHeight, toPhaserColor(color.sky))
    .setOrigin(0)
    .setDepth(depth.sky);

  // The ground: the court tile across the whole surface, with a deep-coloured strip along each
  // side wall and along the net, where the spec's "service boxes, the shaded strip under each
  // wall" reads (TV scene, "Scene palette: padel").
  add
    .tileSprite(courtLeft, farEdgeSy, courtWidth, nearEdgeSy - farEdgeSy, sprites.court.key)
    .setOrigin(0)
    .setDepth(depth.court);
  const deepStrip = 8;
  for (const x of [courtLeft, courtRight - deepStrip]) {
    add
      .tileSprite(x, farEdgeSy, deepStrip, nearEdgeSy - farEdgeSy, sprites.courtDeep.key)
      .setOrigin(0)
      .setDepth(depth.courtDeep);
  }
  add
    .tileSprite(courtLeft, netSy - deepStrip / 2, courtWidth, deepStrip, sprites.courtDeep.key)
    .setOrigin(0)
    .setDepth(depth.courtDeep);
  // The near baseline, in the court-line tile, just above the bottom instruction panel.
  add
    .tileSprite(courtLeft, nearEdgeSy - 2, courtWidth, 2, sprites.courtLine.key)
    .setOrigin(0)
    .setDepth(depth.courtDeep + 0.1);

  // The far glass band above the far edge.
  add
    .tileSprite(
      courtLeft,
      farEdgeSy - farGlassHeight,
      courtWidth,
      farGlassHeight,
      sprites.glassBand.key,
    )
    .setOrigin(0)
    .setDepth(depth.farGlass);

  // Each side wall: corner glass, side mesh, corner glass.
  const { cornerNearBottom, cornerNearTop, meshBottom, meshTop, cornerFarBottom, cornerFarTop } =
    sideWallBands;
  for (const x of [sideWall.leftOuter, sideWall.rightInner]) {
    sideBand(scene, x, cornerNearBottom, cornerNearTop, sprites.glassBand.key);
    sideBand(scene, x, meshBottom, meshTop, sprites.meshBand.key);
    sideBand(scene, x, cornerFarBottom, cornerFarTop, sprites.glassBand.key);
  }

  // Floodlight poles at the two far corners.
  for (const x of [sideWall.leftOuter - 2, sideWall.rightOuter + 2]) {
    add
      .image(x, farEdgeSy - farGlassHeight, sprites.floodlightPole.key)
      .setOrigin(0.5, 1)
      .setDepth(depth.floodlight);
  }

  // The net, across the whole court width.
  add
    .tileSprite(
      courtLeft,
      netSy - netBandHeight / 2,
      courtWidth,
      netBandHeight,
      sprites.netBand.key,
    )
    .setOrigin(0)
    .setDepth(depth.net);
}

/** One player's World Pip and shape mark, at their current position (`BandejaState.positions`,
 * walked toward the ball's landing spot every tick by `ai/positions.ts`, CC-23.8). Both the body
 * and the shape mark are repositioned every `update`, since a slot's spot now moves. */
class PipActor {
  readonly body: GameObjects.Image;
  readonly marker: GameObjects.Graphics;
  readonly #scene: Scene;
  #look: WorldPipLook;

  constructor(scene: Scene, pip: PipPresentation, look: WorldPipLook) {
    this.#scene = scene;
    this.#look = look;
    this.marker = scene.add.graphics().setDepth(depth.pip - 0.5);
    this.body = scene.add.image(0, 0, this.#texture(pip)).setOrigin(0).setDepth(depth.pip);
    this.#place(pip);
  }

  #texture(pip: PipPresentation): string {
    const face: WorldPipFace = { expression: pip.expression };
    return buildWorldPip(this.#scene, this.#look, face);
  }

  /** Moves the body to `pip`'s current spot and redraws the shape mark there: `drawWorldPipMarker`
   * paints into the graphics buffer at absolute coordinates rather than through a transform, so a
   * moved mark has to be cleared and repainted, not just repositioned. */
  #place(pip: PipPresentation): void {
    const origin = worldPipOrigin(pip.x, pip.feetY);
    this.body.setPosition(origin.x, origin.y);
    this.marker.clear();
    drawWorldPipMarker(this.marker, this.#look.slot, pip.x, pip.feetY);
  }

  update(pip: PipPresentation, look: WorldPipLook): void {
    this.#look = look;
    this.body.setTexture(this.#texture(pip));
    this.#place(pip);
  }
}

/** The swing ring pool: one image per match slot, shown while its arrival is within the window. */
export class RingPool {
  readonly #scene: Scene;
  readonly #rings = new Map<SlotName, GameObjects.Image>();

  constructor(scene: Scene) {
    this.#scene = scene;
  }

  update(rings: readonly RingPresentation[]): void {
    const shown = new Set(rings.map((ring) => ring.slot));
    for (const [slot, image] of this.#rings) if (!shown.has(slot)) image.setVisible(false);
    for (const ring of rings) {
      let image = this.#rings.get(ring.slot);
      if (!image) {
        image = this.#scene.add
          .image(0, 0, sprites.swingRing.key)
          .setOrigin(0.5, 0.5)
          .setDepth(depth.ring);
        this.#rings.set(ring.slot, image);
      }
      image
        .setVisible(true)
        .setPosition(ring.x, ring.y - worldPipSize.height * 0.6)
        .setScale(ring.scale)
        .setTint(ring.snap ? toPhaserColor(color.sunny) : 0xffffff);
    }
  }
}

/** A player's look, from the host's seats: jersey and shape from their seat, skin and hair from
 * their Pip profile. `id` is null for an auto-returning/empty slot, which gets a generic look. */
export type LookOf = (id: string | null, slot: number) => WorldPipLook;

/** Everything in the world that changes: the ball, its shadow, the players and the swing rings. */
export class BandejaWorld {
  readonly #scene: Scene;
  readonly #lookOf: LookOf;
  readonly ball: GameObjects.Image;
  readonly shadow: GameObjects.Image;
  readonly rings: RingPool;
  readonly #pips = new Map<SlotName, PipActor>();

  constructor(scene: Scene, view: Presentation, lookOf: LookOf) {
    this.#scene = scene;
    this.#lookOf = lookOf;
    buildCourt(scene);
    this.shadow = scene.add
      .image(0, 0, sprites.ballShadow.key)
      .setOrigin(0.5)
      .setDepth(depth.shadow)
      .setVisible(false);
    this.ball = scene.add
      .image(0, 0, sprites.ball.key)
      .setOrigin(0.5)
      .setDepth(depth.ball)
      .setVisible(false);
    this.rings = new RingPool(scene);
    view.pips.forEach((pip, index) => this.#pipFor(pip, index));
  }

  #pipFor(pip: PipPresentation, index: number): PipActor {
    let actor = this.#pips.get(pip.slot);
    const look = this.#lookOf(pip.id, index);
    if (!actor) {
      actor = new PipActor(this.#scene, pip, look);
      this.#pips.set(pip.slot, actor);
    }
    return actor;
  }

  update(view: Presentation): void {
    if (view.ball) {
      this.ball.setVisible(true).setPosition(view.ball.x, view.ball.y);
      this.shadow.setVisible(true).setPosition(view.ball.shadowX, view.ball.shadowY);
    } else {
      this.ball.setVisible(false);
      this.shadow.setVisible(false);
    }
    view.pips.forEach((pip, index) => {
      const actor = this.#pipFor(pip, index);
      actor.update(pip, this.#lookOf(pip.id, index));
    });
    this.rings.update(view.rings);
  }
}
