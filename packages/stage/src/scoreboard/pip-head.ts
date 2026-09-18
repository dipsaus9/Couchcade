import type { PipProfile } from "@couchcade/protocol";
import {
  color,
  pip as pipColours,
  pipEyes,
  pipHairBack,
  pipHairFront,
  pipHairstyleIds,
  pipHead as pipHeadGeometry,
  pipJersey,
  pipJerseyNeck,
  pipMouth,
  pipViewBox,
  pipViewBoxWidth,
  players as playerTokens,
  shape,
  type PipElement,
  type PipExpression,
  type PipHairstyleId,
  type PipPaint,
} from "@couchcade/theme";
import type { Scene } from "phaser";

/**
 * The Interface Pip head crop as a cached Phaser texture, for the stage scoreboard's player chips
 * (docs/architecture/pips.md "Pips on the TV": "Stage scoreboard chips during games | Interface
 * Pip head, 56px"). Built from the same `@couchcade/theme` part data `CcPip` draws (pips.md
 * decision 10, "Both kits draw from the same part data"), so a player's TV chip never drifts from
 * their phone's look.
 *
 * `@couchcade/theme`'s vector data is SVG element attributes; a stage kit package can only reach
 * the canvas 2D context Phaser textures give it (`buildWorldPip` in `../pips/index.ts` does the
 * same for the World Pip), so this bakes the same paths with `Path2D` (which parses the same "d"
 * mini-language a browser's SVG renderer does) instead of loading an `<img>` from a data URI —
 * the same pixels, built synchronously, cached the same way `buildWorldPip` already is.
 */

/** The 56px size from pips.md's "Sizes on screen" table ("TV game menu and scoreboard chips"). */
export const interfacePipHeadSize = 56;

/** Baked at 2x the display size, so the texture stays crisp at the overlay's x2 4K zoom. */
export const interfacePipHeadTextureScale = 2;
const TEXTURE_SIZE = interfacePipHeadSize * interfacePipHeadTextureScale;

export interface InterfacePipHeadLook {
  profile: PipProfile;
  /** 0 to 7 picks the jersey colour; `null` is audience (Chalk jersey, no V-neck accent). */
  slot: number | null;
  expression?: PipExpression;
}

/** Wraps an out-of-range index instead of throwing, so a bad profile can never crash the TV. */
function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}

function resolvePaint(
  paint: PipPaint | undefined,
  profile: PipProfile,
  slot: number | null,
): string {
  switch (paint) {
    case "skin":
      return pipColours.skin[wrap(profile.skin, pipColours.skin.length)] as string;
    case "hair":
      return pipColours.hair[wrap(profile.hairColour, pipColours.hair.length)] as string;
    case "jersey":
      return slot === null
        ? color.chalk
        : (playerTokens[wrap(slot, playerTokens.length)]?.color ?? color.chalk);
    case "chalk":
      return color.chalk;
    case "ink":
    case undefined:
      return color.ink;
  }
}

/** `PipElement`s are only ever circles or paths for Pips (theme/test/pips.test.ts checks this). */
function pathFor(part: PipElement): Path2D {
  if (part.tag === "circle") {
    const { cx, cy, r } = part.attrs as { cx: number; cy: number; r: number };
    const path = new Path2D();
    path.arc(cx, cy, r, 0, Math.PI * 2);
    return path;
  }
  if (part.tag === "path") return new Path2D(String((part.attrs as { d: string }).d));
  throw new Error(`Interface Pip geometry never uses a "${part.tag}" element`);
}

/** A texture key part for a look, so equal Pips share one texture (mirrors pips.md "Textures"). */
export function interfacePipHeadKey({
  profile,
  slot,
  expression = "neutral",
}: InterfacePipHeadLook): string {
  return `pip:head:${profile.skin}-${profile.hair}-${profile.hairColour}-${slot ?? "aud"}-${expression}`;
}

/**
 * Ensures the Phaser texture for an Interface Pip head crop exists and returns its key. Call it
 * when a game starts or a player joins, never inside a render loop (pips.md "Textures").
 */
export function buildInterfacePipHead(scene: Scene, look: InterfacePipHeadLook): string {
  const key = interfacePipHeadKey(look);
  const { textures } = scene;
  if (textures.exists(key)) return key;

  const texture = textures.createCanvas(key, TEXTURE_SIZE, TEXTURE_SIZE);
  if (texture === null) throw new Error(`Couldn't create the Interface Pip head texture ${key}`);
  const ctx = texture.context;

  const { profile, slot, expression = "neutral" } = look;
  const hairstyleId = pipHairstyleIds[wrap(profile.hair, pipHairstyleIds.length)] as PipHairstyleId;

  const viewBoxWidth = pipViewBoxWidth.head;
  const scale = TEXTURE_SIZE / viewBoxWidth;
  const [vx, vy] = pipViewBox.head.split(" ").map(Number) as [number, number];

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-vx, -vy);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Every body part gets a fill and the full Ink outline (pips.md "Interface Pip": "Ink stroke
  // around every part"). Matches CcPip.vue's bodyParts, minus the chest shape mark: that mark is
  // `ui`-tier geometry (packages/ui/src/components/shapes.ts) stage can't import (kit packages
  // never import each other), and it sits almost entirely below this crop's bottom edge anyway
  // (pips.md: the mark is at y 89, the head crop ends at y 92).
  const strokeWidth = (shape.outline.tv * viewBoxWidth) / interfacePipHeadSize;
  ctx.lineWidth = strokeWidth;
  const drawBody = (part: PipElement): void => {
    const path = pathFor(part);
    ctx.fillStyle = resolvePaint(part.paint, profile, slot);
    ctx.fill(path);
    ctx.strokeStyle = color.ink;
    ctx.stroke(path);
  };

  const back = pipHairBack[hairstyleId];
  if (back) drawBody(back);
  drawBody(pipJersey);
  if (slot !== null) drawBody(pipJerseyNeck);
  drawBody(pipHeadGeometry);
  const front = pipHairFront[hairstyleId];
  if (front) drawBody(front);

  // Face parts: a filled dot/shape has no outline of its own; an unpainted path is an ink line at
  // the face stroke width (CcPip.vue's renderFace).
  const faceStrokeWidth = Math.min(4.4, Math.max(2.4, strokeWidth * 0.8));
  const drawFace = (part: PipElement): void => {
    const path = pathFor(part);
    const filled = part.paint !== undefined || part.tag === "circle";
    if (filled) {
      ctx.fillStyle = resolvePaint(part.paint ?? "ink", profile, slot);
      ctx.fill(path);
    } else {
      ctx.strokeStyle = color.ink;
      ctx.lineWidth = faceStrokeWidth;
      ctx.stroke(path);
      ctx.lineWidth = strokeWidth;
    }
  };
  for (const eye of pipEyes[expression]) drawFace(eye);
  drawFace(pipMouth[expression]);

  ctx.restore();
  texture.refresh();
  return key;
}
