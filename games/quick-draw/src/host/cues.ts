import { tickMs } from "@couchcade/game-sdk/contract";
import type { FakeKind, QuickDrawState, TapResult } from "../shared/index.ts";

/**
 * Moments the TV marks with a sound. The scene emits each one on its event emitter under
 * `quickDrawCueEvent`, the frame it first shows it. `./sounds.ts`'s `playCueSound` subscribes to
 * it (CC-7.8) and turns each cue into an `@couchcade/audio` call. Every cue already has its
 * visual in the scene, so the game works with the sound off.
 */
export type QuickDrawCue =
  /** `intro` starts: the music loop plays, the tumbleweed rolls. */
  | { type: "round"; round: number }
  /** `standoff` starts: the music stops and the wind loop starts. */
  | { type: "standoff"; round: number }
  /** A fake shows: the fake sting (`word`), the crow's caw (`crow`) or a ting (`glint`). */
  | { type: "fake"; kind: FakeKind; word: string | null; playerId: string | null }
  /** DRAW! shows: the DRAW sting, on this frame and no other. */
  | { type: "draw"; round: number }
  /** FOUL! shows over a Pip: the `foul` token. */
  | { type: "foul"; playerId: string; fooled: boolean }
  /** `result` starts: one pop per valid tap in reaction order, then `celebrate` for the winners. */
  | { type: "result"; round: number; pops: string[]; winners: string[] }
  /** The match is over. */
  | { type: "over" };

/** The event name the scene emits cues under: `scene.events.on(quickDrawCueEvent, play)`. */
export const quickDrawCueEvent = "quick-draw:cue";

const slackMs = tickMs / 2;

const sameResult = (a: TapResult | null | undefined, b: TapResult | null): boolean =>
  a !== null && a !== undefined && b !== null && a.kind === b.kind && a.atMs === b.atMs;

/**
 * The cues between two states the scene rendered. A TV that renders slower than the 60 Hz step
 * can skip ticks, so cues come from what changed, never from matching one exact tick. With no
 * previous state (the scene's first frame) only the round cue plays.
 */
export function cuesBetween(previous: QuickDrawState | null, next: QuickDrawState): QuickDrawCue[] {
  if (previous === null) {
    return next.phase === "intro" ? [{ type: "round", round: next.round }] : [];
  }
  const cues: QuickDrawCue[] = [];

  if (next.phase === "intro" && (previous.phase !== "intro" || previous.round !== next.round)) {
    cues.push({ type: "round", round: next.round });
  }
  // drawDueMs is rolled when a standoff starts, so a new value means a new standoff.
  if (next.drawDueMs !== null && next.drawDueMs !== previous.drawDueMs) {
    cues.push({ type: "standoff", round: next.round });
  }
  for (const fake of next.fakes) {
    if (fake.atMs > previous.nowMs + slackMs && fake.atMs <= next.nowMs + slackMs) {
      cues.push({ type: "fake", kind: fake.kind, word: fake.word, playerId: fake.playerId });
    }
  }
  if (next.drawAtMs !== null && next.drawAtMs !== previous.drawAtMs) {
    cues.push({ type: "draw", round: next.round });
  }
  for (const player of next.players) {
    const { result } = player;
    if (result === null || (result.kind !== "foul" && result.kind !== "fooled")) continue;
    const before = previous.players.find((candidate) => candidate.id === player.id)?.result;
    if (!sameResult(before, result)) {
      cues.push({ type: "foul", playerId: player.id, fooled: result.kind === "fooled" });
    }
  }
  if (next.phase === "result" && (previous.phase !== "result" || previous.round !== next.round)) {
    const pops = next.players
      .filter((player) => player.result?.kind === "valid")
      .toSorted((a, b) => (a.result?.ms ?? 0) - (b.result?.ms ?? 0))
      .map((player) => player.id);
    cues.push({ type: "result", round: next.round, pops, winners: [...next.winners] });
  }
  if (next.phase === "over" && previous.phase !== "over") cues.push({ type: "over" });
  return cues;
}
