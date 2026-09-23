import { color, toPhaserColor, world } from "@couchcade/theme";
import {
  buildWorldPip,
  drawPlayerShape,
  drawWorldPipMarker,
  worldPipOrigin,
} from "@couchcade/stage";
import type { WorldPipFace, WorldPipLook } from "@couchcade/stage";
import { Math as PhaserMath } from "phaser";
import type { GameObjects, Scene } from "phaser";
import { green } from "./layout.ts";
import type {
  AimLinePresentation,
  BallPresentation,
  HazardPresentation,
  PipPresentation,
  Presentation,
} from "./present.ts";

/**
 * The green, drawn procedurally (docs/games/putt-club.md, "TV scene"). CC-13.5 hasn't landed the
 * game's CC0 sprite art yet (`games/putt-club/assets/` is still empty, unlike Bandeja's and Quick
 * Draw's `assets/sprites/` PNGs this scene would otherwise stamp), so every element here is Phaser
 * `Graphics`, coloured from the `green` palette (`layout.ts`). A follow-up can swap these fills for
 * sprites once CC-13.5 lands without touching the projection, the state reads or the tests.
 *
 * No `GeometryMask` (Strike Night's `world.ts` already found it only clips in the Canvas renderer,
 * not WebGL): the mown stripes are clipped to `hole.bounds` -- a plain rectangle, which is exactly
 * the placeholder course's own boundary (`shared/course.ts`) -- and the kerb band drawn on top of
 * them covers the seam for any future hole whose wall loop isn't the full bounds rectangle.
 *
 * The hole's shape is never assumed: every wall, hazard, the cup and the tee come from
 * `Presentation`, already projected from whatever `course[state.hole - 1]` the shared rules hand
 * this scene (the placeholder rectangles today, CC-13.8's nine real holes once that story lands).
 */

const depth = {
  backdrop: -30,
  terrain: -20,
  flag: -9,
  aimLine: -5,
  balls: 0,
  pipMarker: 9,
  pip: 10,
} as const;

const inkNumber = toPhaserColor(color.ink);
const chalkNumber = toPhaserColor(color.chalk);
const sunnyNumber = toPhaserColor(color.sunny);
const signalNumber = toPhaserColor(color.signal);

const ballRadiusPx = 3;
const ghostAlpha = 0.2;

function vector(points: readonly { x: number; y: number }[]): PhaserMath.Vector2[] {
  return points.map(({ x, y }) => new PhaserMath.Vector2(x, y));
}

/** The carpet, the mown stripes on top of it, then the hazards, kerbs and cup mouth, in that
 * draw order (later fills sit visually above earlier ones within the same `Graphics`). */
function drawTerrain(graphics: GameObjects.Graphics, view: Presentation): void {
  graphics.clear();

  graphics.fillStyle(toPhaserColor(green.carpet));
  graphics.fillPoints(vector(view.carpet), true);

  graphics.fillStyle(toPhaserColor(green.mown));
  for (const stripe of view.stripes)
    graphics.fillRect(stripe.x, stripe.y, stripe.width, stripe.height);

  for (const hazard of view.hazards) drawHazard(graphics, hazard);

  // Kerbs: an Ink-outlined timber band along every wall (loop or interior baffle), covering the
  // seam between the carpet/stripes rectangle and the wall loop for a non-rectangular hole.
  for (const kerb of view.kerbs) {
    const points = vector(kerb.points);
    graphics.lineStyle(8, inkNumber, 1).strokePoints(points, kerb.loop, kerb.loop);
    graphics.lineStyle(6, toPhaserColor(green.kerb), 1).strokePoints(points, kerb.loop, kerb.loop);
  }

  // The cup: an Ink mouth in the size `captureRadius` earns, a `gravel` rim (Scene palette:
  // green, "Gravel... the cup's rim").
  graphics.fillStyle(toPhaserColor(green.gravel));
  graphics.fillCircle(view.cup.x, view.cup.y, view.cup.radius + 1);
  graphics.fillStyle(inkNumber);
  graphics.fillCircle(view.cup.x, view.cup.y, view.cup.radius);
}

function drawHazard(graphics: GameObjects.Graphics, hazard: HazardPresentation): void {
  const fill = hazard.kind === "water" ? toPhaserColor(green.water) : inkNumber;
  const rim = hazard.kind === "water" ? chalkNumber : toPhaserColor(green.gravel);
  if (hazard.shape === "box") {
    graphics.fillStyle(rim);
    graphics.fillRect(hazard.x - 2, hazard.y - 2, hazard.width + 4, hazard.height + 4);
    graphics.fillStyle(fill);
    graphics.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
  } else {
    graphics.fillStyle(rim);
    graphics.fillEllipse(hazard.x, hazard.y, (hazard.radiusX + 2) * 2, (hazard.radiusY + 2) * 2);
    graphics.fillStyle(fill);
    graphics.fillEllipse(hazard.x, hazard.y, hazard.radiusX * 2, hazard.radiusY * 2);
  }
}

/** A 3×14 Chalk flag pin with a Signal flag, planted in the cup. */
function drawFlag(graphics: GameObjects.Graphics, view: Presentation): void {
  graphics.clear();
  const { x, y } = view.flag;
  graphics.fillStyle(chalkNumber);
  graphics.fillRect(x - 1, y - 14, 2, 14);
  graphics.fillStyle(signalNumber);
  graphics.fillTriangle(x + 1, y - 14, x + 1, y - 8, x + 8, y - 11);
}

/** A 2 px dashed (or, locked, solid Sunny) line from the ball, with a small arrowhead. Direction
 * only, never the predicted path (TV scene, "Aim line"). */
function drawAimLine(graphics: GameObjects.Graphics, line: AimLinePresentation | null): void {
  graphics.clear();
  if (line === null) return;
  const tint = line.locked ? sunnyNumber : chalkNumber;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const step = 6;
  const dashCount = Math.max(1, Math.floor(length / step / 2));
  graphics.lineStyle(2, tint, 1);
  for (let i = 0; i < dashCount; i++) {
    const t0 = (i * 2 * step) / length;
    const t1 = Math.min(1, (i * 2 * step + step) / length);
    graphics.lineBetween(
      line.x1 + dx * t0,
      line.y1 + dy * t0,
      line.x1 + dx * t1,
      line.y1 + dy * t1,
    );
  }
  const angle = Math.atan2(dy, dx);
  const leftX = line.x2 - 4 * Math.cos(angle - Math.PI / 6);
  const leftY = line.y2 - 4 * Math.sin(angle - Math.PI / 6);
  const rightX = line.x2 - 4 * Math.cos(angle + Math.PI / 6);
  const rightY = line.y2 - 4 * Math.sin(angle + Math.PI / 6);
  graphics.fillStyle(tint);
  graphics.fillTriangle(line.x2, line.y2, leftX, leftY, rightX, rightY);
}

/** Every ball, and the player shape 7×7 above it -- ghosted (Ink 20%) for everyone but the
 * current putter (TV scene, "Ball", "Other balls"). */
function drawBalls(graphics: GameObjects.Graphics, balls: readonly BallPresentation[]): void {
  graphics.clear();
  for (const ball of balls) {
    if (ball.ghost) {
      graphics.fillStyle(inkNumber, ghostAlpha);
      graphics.fillCircle(ball.x, ball.y, ballRadiusPx);
    } else {
      graphics.fillStyle(inkNumber);
      graphics.fillCircle(ball.x, ball.y, ballRadiusPx + 1);
      graphics.fillStyle(chalkNumber);
      graphics.fillCircle(ball.x, ball.y, ballRadiusPx);
    }
    drawPlayerShape(graphics, ball.shape, ball.color, ball.x - 4, ball.y - 14);
  }
}

/** One player's World Pip and shape mark (`packages/stage/src/pips`), positioned by `present.ts`:
 * beside the ball for the putter, on the waiting line for everyone else. */
class PipActor {
  readonly body: GameObjects.Image;
  readonly marker: GameObjects.Graphics;
  readonly #scene: Scene;
  #look: WorldPipLook;

  constructor(scene: Scene, pip: PipPresentation, look: WorldPipLook) {
    this.#scene = scene;
    this.#look = look;
    this.marker = scene.add.graphics().setDepth(depth.pipMarker);
    this.body = scene.add.image(0, 0, this.#texture(pip)).setOrigin(0).setDepth(depth.pip);
    this.#place(pip);
  }

  #texture(pip: PipPresentation): string {
    const face: WorldPipFace = { expression: pip.expression };
    return buildWorldPip(this.#scene, this.#look, face);
  }

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

  destroy(): void {
    this.body.destroy();
    this.marker.destroy();
  }
}

export type LookOf = (playerId: string) => WorldPipLook;

/** Everything the green needs to draw, rebuilt from `Presentation` every frame -- cheap at this
 * canvas size, and simplest to keep correct for whatever hole shape the course data holds. */
export class PuttClubWorld {
  readonly #scene: Scene;
  readonly #lookOf: LookOf;
  readonly #terrain: GameObjects.Graphics;
  readonly #flag: GameObjects.Graphics;
  readonly #aimLine: GameObjects.Graphics;
  readonly #balls: GameObjects.Graphics;
  readonly #pips = new Map<string, PipActor>();

  constructor(scene: Scene, view: Presentation, lookOf: LookOf) {
    this.#scene = scene;
    this.#lookOf = lookOf;

    scene.add
      .rectangle(0, 0, world.width, world.height, toPhaserColor(color.turf))
      .setOrigin(0)
      .setDepth(depth.backdrop);

    this.#terrain = scene.add.graphics().setDepth(depth.terrain);
    this.#flag = scene.add.graphics().setDepth(depth.flag);
    this.#aimLine = scene.add.graphics().setDepth(depth.aimLine);
    this.#balls = scene.add.graphics().setDepth(depth.balls);
    this.update(view);
  }

  update(view: Presentation): void {
    drawTerrain(this.#terrain, view);
    drawFlag(this.#flag, view);
    drawAimLine(this.#aimLine, view.aimLine);
    drawBalls(this.#balls, view.balls);

    const seen = new Set<string>();
    for (const pip of view.pips) {
      seen.add(pip.playerId);
      const look = this.#lookOf(pip.playerId);
      let actor = this.#pips.get(pip.playerId);
      if (actor === undefined) {
        actor = new PipActor(this.#scene, pip, look);
        this.#pips.set(pip.playerId, actor);
      } else {
        actor.update(pip, look);
      }
    }
    for (const [id, actor] of this.#pips) {
      if (!seen.has(id)) {
        actor.destroy();
        this.#pips.delete(id);
      }
    }
  }
}
