/**
 * Moments the TV marks with a sound (docs/games/strike-night.md, "TV scene", "Sound"). The scene
 * emits each one on its event emitter under `strikeNightCueEvent`, the frame it first shows it.
 * Sound arrives with `@couchcade/audio` (CC-7.2) registering samples for these tokens; until then
 * nothing listens. Every cue already has its visual in the scene, so the game works with the
 * sound off.
 *
 * `@couchcade/physics` drops its contact pairs after each step (`shared/physics.ts` only keeps
 * them long enough to mark a pin as fallen), so this reads state deltas, the same way Quick
 * Draw's and Target Range's `cuesBetween` do, rather than per-contact detail: one crash per roll,
 * sized by how many pins ended up down, not one clatter per pin-to-pin hit.
 */
import type { RollResult, StrikeNightState } from "../shared/index.ts";

export type StrikeNightCue =
  /** `lineup` starts: the bowler's turn. */
  | { type: "lineup"; turn: number }
  /** `rolling` starts: the ball leaves the hand. */
  | { type: "roll" }
  /** The ball entered the gutter. */
  | { type: "gutter" }
  /** `result` starts: the pin count, sized by how many fell. */
  | { type: "settled"; pins: number }
  /** The frame's sweep, between roll 1 and roll 2. */
  | { type: "sweep" }
  /** A tick in the turn timer's last 5 seconds. */
  | { type: "tick"; secondsLeft: number }
  /** `result`'s callout, once the pin count has shown (docs, "Readability", rule 5). */
  | { type: "result"; mark: RollResult["mark"]; turkey: boolean }
  /** The match is over. */
  | { type: "over" };

/** The event name the scene emits cues under: `scene.events.on(strikeNightCueEvent, play)`. */
export const strikeNightCueEvent = "strike-night:cue";

/** Whether a roll's frame is the bowler's third strike in a row (mirrors `present.ts`'s helper;
 * duplicated rather than imported, since a cue and a callout can disagree on timing). */
function isTurkey(state: StrikeNightState, playerId: string, frame: number): boolean {
  if (frame < 3) return false;
  const player = state.players.find((candidate) => candidate.id === playerId);
  const strikeAt = (n: number): boolean => player?.frames[n - 1]?.roll1 === 10;
  return strikeAt(frame) && strikeAt(frame - 1) && strikeAt(frame - 2);
}

/**
 * The cues between two states the scene rendered. A TV that renders slower than the 60 Hz step
 * can skip ticks, so cues come from what changed, never from matching one exact tick. With no
 * previous state (the scene's first frame) nothing plays.
 */
export function cuesBetween(
  previous: StrikeNightState | null,
  next: StrikeNightState,
): StrikeNightCue[] {
  if (previous === null) return [];
  const cues: StrikeNightCue[] = [];

  if (next.phase === "lineup" && (previous.phase !== "lineup" || previous.turn !== next.turn)) {
    cues.push({ type: "lineup", turn: next.turn });
  }
  if (next.phase === "rolling" && previous.phase !== "rolling") cues.push({ type: "roll" });
  if (next.activeRoll?.gutter === true && previous.activeRoll?.gutter !== true) {
    cues.push({ type: "gutter" });
  }
  if (next.phase === "result" && previous.phase !== "result") {
    const bowler = next.players.find((player) => player.id === next.bowlerId);
    const last = bowler?.last;
    if (last !== null && last !== undefined) {
      cues.push({ type: "settled", pins: last.pins });
      if (!last.auto && last.mark !== "gutter" && last.mark !== "open") {
        cues.push({
          type: "result",
          mark: last.mark,
          turkey: last.mark === "strike" && isTurkey(next, bowler?.id ?? "", next.frame),
        });
      }
    }
  }
  // The sweep runs between roll 1's result and roll 2's lineup, same bowler and frame.
  if (
    next.phase === "lineup" &&
    previous.phase === "result" &&
    next.frame === previous.frame &&
    next.roll === 2
  ) {
    cues.push({ type: "sweep" });
  }
  if (next.phase === "lineup" && next.deadlineMs !== null) {
    const remaining = Math.ceil((next.deadlineMs - next.nowMs) / 1000);
    const previousRemaining =
      previous.phase === "lineup" && previous.deadlineMs !== null
        ? Math.ceil((previous.deadlineMs - previous.nowMs) / 1000)
        : null;
    if (remaining >= 1 && remaining <= 5 && remaining !== previousRemaining) {
      cues.push({ type: "tick", secondsLeft: remaining });
    }
  }
  if (next.phase === "over" && previous.phase !== "over") cues.push({ type: "over" });
  return cues;
}
