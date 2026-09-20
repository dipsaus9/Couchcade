import { tickMs } from "@couchcade/game-sdk/contract";
import { bullseyePoints, volleyMs, volleyOf } from "../shared/index.ts";
import type { TargetRangeState } from "../shared/index.ts";

/**
 * Moments the TV marks with a sound (docs/games/target-range.md, "TV scene", Sound). The scene
 * emits each one on its event emitter under `targetRangeCueEvent`, the frame it first shows it.
 * `./sounds.ts`'s `playCueSound` subscribes to it (CC-7.8) and turns each cue into an
 * `@couchcade/audio` call. Every cue already has its visual in the scene, so the game works with
 * the sound off.
 */
export type TargetRangeCue =
  /** `intro` starts: the music loop, and the wind loop from round 2. */
  | { type: "round"; round: number }
  /** A volley opens: the music gets quieter. */
  | { type: "open"; volley: number }
  /** A player's crosshair appears: the draw creak (the listener plays at most one at a time). */
  | { type: "draw"; playerId: string }
  /** A player let go: the release twang. */
  | { type: "shoot"; playerId: string }
  /** An arrow hit the target or the grass: the thud. */
  | { type: "land"; playerId: string; points: number }
  /** One of the last 3 seconds of the volley clock: the tick. */
  | { type: "tick"; seconds: number }
  /** `reveal` starts, with a ding when anyone hit a 10. */
  | { type: "reveal"; volley: number; bullseye: boolean }
  /** `roundEnd` starts: the music comes back. */
  | { type: "roundEnd"; round: number }
  /** The match is over. */
  | { type: "over" };

/** The event name the scene emits cues under: `scene.events.on(targetRangeCueEvent, play)`. */
export const targetRangeCueEvent = "target-range:cue";

const slackMs = tickMs / 2;

/** Whole seconds left on the volley clock at game time `nowMs`. */
const secondsLeft = (state: TargetRangeState): number =>
  state.openAtMs === null
    ? 0
    : Math.max(0, Math.ceil((state.openAtMs + volleyMs - state.nowMs - slackMs) / 1000));

/**
 * The cues between two states the scene rendered. A TV that renders slower than the 60 Hz step
 * can skip ticks, so cues come from what changed, never from matching one exact tick. With no
 * previous state (the scene's first frame) only the round cue plays.
 */
export function cuesBetween(
  previous: TargetRangeState | null,
  next: TargetRangeState,
): TargetRangeCue[] {
  if (previous === null) {
    return next.phase === "intro" ? [{ type: "round", round: next.round }] : [];
  }
  const cues: TargetRangeCue[] = [];
  const entered = (phase: TargetRangeState["phase"]) =>
    next.phase === phase && (previous.phase !== phase || volleyOf(previous) !== volleyOf(next));

  if (next.phase === "intro" && (previous.phase !== "intro" || previous.round !== next.round)) {
    cues.push({ type: "round", round: next.round });
  }
  if (entered("open")) cues.push({ type: "open", volley: volleyOf(next) });
  if (next.phase === "open") {
    for (const player of next.players) {
      const before = previous.players.find((candidate) => candidate.id === player.id);
      if (player.aiming && !(before?.aiming ?? false)) {
        cues.push({ type: "draw", playerId: player.id });
      }
    }
    const seconds = secondsLeft(next);
    if (
      seconds >= 1 &&
      seconds <= 3 &&
      (previous.phase !== "open" || secondsLeft(previous) > seconds)
    ) {
      cues.push({ type: "tick", seconds });
    }
  }
  const known = new Map(
    previous.arrows.map((arrow) => [`${arrow.volley}:${arrow.playerId}`, arrow]),
  );
  for (const arrow of next.arrows) {
    const before = known.get(`${arrow.volley}:${arrow.playerId}`);
    if (before === undefined) cues.push({ type: "shoot", playerId: arrow.playerId });
    if (arrow.landed && !(before?.landed ?? false)) {
      cues.push({ type: "land", playerId: arrow.playerId, points: arrow.points });
    }
  }
  if (entered("reveal")) {
    cues.push({
      type: "reveal",
      volley: volleyOf(next),
      bullseye: next.players.some((player) => player.result === bullseyePoints),
    });
  }
  if (next.phase === "roundEnd" && previous.phase !== "roundEnd") {
    cues.push({ type: "roundEnd", round: next.round });
  }
  if (next.phase === "over" && previous.phase !== "over") cues.push({ type: "over" });
  return cues;
}
