import { cornerGlassMaxY, cornerGlassMinY, courtMaxX, courtMinX } from "../shared/index.ts";
import type { BandejaState } from "../shared/index.ts";

/**
 * Moments the TV marks with a sound (docs/games/bandeja.md, "TV scene", "Sound"). The scene emits
 * each one on its event emitter under `bandejaCueEvent`, the frame it first shows it. `./sounds.ts`'s
 * `playCueSound` subscribes to it and turns each cue into an `@couchcade/audio` call. Every cue
 * already has its visual in the scene (the racket, the shadow meeting the floor, the wall that
 * flashed, the net, the callout), so the game works with the sound off.
 */
export type BandejaCue =
  /** `intro` starts: the music loop. */
  | { type: "match" }
  /** `serve` starts: the game hits the ball into play. */
  | { type: "serve" }
  /** A swing (or an auto-return) connected: the racket pock. */
  | { type: "hit" }
  /** The ball touched the floor. */
  | { type: "bounce" }
  /** The ball came off the back glass or a corner glass panel. */
  | { type: "wall"; surface: "glass" }
  /** The ball came off a side mesh panel. */
  | { type: "wall"; surface: "mesh" }
  /** A shot found the net: the net flub. */
  | { type: "net" }
  /** A rally ended (any reason): the crowd swell / point ding. */
  | { type: "point" }
  /** The match is over: the jingle. */
  | { type: "matchEnd" };

/** The event name the scene emits cues under: `scene.events.on(bandejaCueEvent, play)`. */
export const bandejaCueEvent = "bandeja:cue";

const wallEpsilon = 0.15;

/** True when `x` just bounced off a side wall this step (the plan velocity's `x` flipped sign near
 * a boundary). Never fires for the net, which only ever changes `vy`. */
function sideWallBounce(before: BandejaState, next: BandejaState): "glass" | "mesh" | null {
  const a = before.ball;
  const b = next.ball;
  if (a === null || b === null) return null;
  const nearLeft = b.body.x <= courtMinX + wallEpsilon;
  const nearRight = b.body.x >= courtMaxX - wallEpsilon;
  if (!nearLeft && !nearRight) return null;
  if (Math.sign(a.body.vx) === Math.sign(b.body.vx) || b.body.vx === 0) return null;
  const corner = b.body.y <= cornerGlassMaxY || b.body.y >= cornerGlassMinY;
  return corner ? "glass" : "mesh";
}

/** True when the ball just bounced off the back glass (its `vy` flipped near a back wall). */
function backGlassBounce(before: BandejaState, next: BandejaState): boolean {
  const a = before.ball;
  const b = next.ball;
  if (a === null || b === null) return false;
  const nearBack = b.body.y <= wallEpsilon || b.body.y >= 20 - wallEpsilon;
  if (!nearBack) return false;
  return Math.sign(a.body.vy) !== Math.sign(b.body.vy) && b.body.vy !== 0;
}

/**
 * The cues between two states the scene rendered. A TV that renders slower than the 60 Hz step
 * can skip ticks, so cues come from what changed, never from matching one exact tick. With no
 * previous state (the scene's first frame) nothing plays yet: `create()` fires `match` itself.
 */
export function cuesBetween(previous: BandejaState | null, next: BandejaState): BandejaCue[] {
  if (previous === null) return [];
  const cues: BandejaCue[] = [];

  if (next.phase === "intro" && previous.phase !== "intro") cues.push({ type: "match" });
  if ((next.phase === "serve" || next.phase === "rally") && previous.phase === "intro") {
    cues.push({ type: "serve" });
  }
  if (next.phase === "serve" && previous.phase === "pointEnd") cues.push({ type: "serve" });

  if (next.rally !== null) {
    const before = previous.rally;
    if (before === null || before.shots !== next.rally.shots) cues.push({ type: "hit" });
    if (before === null || before.bounces !== next.rally.bounces) cues.push({ type: "bounce" });
  }

  const wallSurface = sideWallBounce(previous, next);
  if (wallSurface) cues.push({ type: "wall", surface: wallSurface });
  else if (backGlassBounce(previous, next)) cues.push({ type: "wall", surface: "glass" });

  if (next.phase === "pointEnd" && previous.phase !== "pointEnd") {
    // The net flub carries its own moment; the crowd swell is for POINT!/WINNER! (TV scene,
    // "Sound": "A crowd swell on POINT!"), never doubled up on a net fault.
    if (next.lastPoint?.reason === "net") cues.push({ type: "net" });
    else cues.push({ type: "point" });
  }
  if (next.phase === "over" && previous.phase !== "over") cues.push({ type: "matchEnd" });

  return cues;
}
