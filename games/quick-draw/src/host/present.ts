import { motion } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import { fakeWordShowMs, glintShowMs, introMs } from "../shared/index.ts";
import type { Fake, Phase, QuickDrawPlayer, QuickDrawState, TapResult } from "../shared/index.ts";
import { pipSlots } from "./layout.ts";
import type { PipSlot } from "./layout.ts";

/**
 * What the TV shows for a state: a pure function of the state and the reduced-motion
 * setting. Every animation runs on game time (`state.nowMs`), so the same state
 * always looks the same, in a replay as much as live.
 */

/** Sprite animations run at 10 fps (HOUSE_STYLE: 8 to 12 fps). */
export const frameMs = 100;
/** The crow lands, flaps once (3 frames) and sits until it flies off. */
export const crowShowMs = 900;
/** The dust puff blows past at the start of `result`. */
export const dustShowMs = motion.celebrate.ms;

/** Due times sit on the tick grid. Half a tick of slack absorbs float rounding, as in the rules. */
const slackMs = tickMs / 2;

export type Expression = "neutral" | "happy" | "surprised";

export interface PipLabel {
  text: string;
  /** `time` is Ink on Chalk, `foul` is Chalk with an Ink outline on Signal. */
  tone: "time" | "foul";
  /** Horizontal wobble in world px, for the `foul` motion. */
  offsetX: number;
}

export interface PipPresentation {
  id: string;
  slot: PipSlot;
  points: number;
  /** The seat expired: the Pip stays, but plays no more. */
  left: boolean;
  /** `drawn` once the player tapped this round. */
  pose: "ready" | "drawn";
  expression: Expression;
  blink: boolean;
  label: PipLabel | null;
  /** The BANG! flag on a winner's popgun: 0 to 1 as it pops out, null without a flag. */
  flag: number | null;
}

export interface CalloutPresentation {
  text: string;
  kind: "draw" | "fake";
  /** Game time since the callout appeared. */
  ageMs: number;
}

export interface Presentation {
  phase: Phase;
  round: number;
  /** DRAW! or a fake word. There is only ever one on screen. */
  callout: CalloutPresentation | null;
  /** The crow fake: animation frame 0 to 2, null when there's no crow. */
  crow: { frame: number } | null;
  /** The glint fake: whose popgun sparkles, animation frame 0 to 2. */
  glint: { playerId: string; frame: number } | null;
  /** The tumbleweed during `intro`: its x in world px and frame 0 to 3. */
  tumbleweed: { x: number; frame: number } | null;
  /** The dust puff during `result`: its x in world px and frame 0 to 3. */
  dust: { x: number; frame: number } | null;
  /** The bottom instruction panel. */
  panel: string;
  pips: PipPresentation[];
}

export interface PresentOptions {
  reducedMotion: boolean;
}

const frameAt = (elapsedMs: number, frames: number): number =>
  Math.floor(Math.max(0, elapsedMs) / frameMs) % frames;

/** True while game time is inside `[startMs, startMs + lengthMs)`. */
const showing = (nowMs: number, startMs: number, lengthMs: number): boolean =>
  nowMs >= startMs - slackMs && nowMs < startMs + lengthMs - slackMs;

/** `0.243` for 243 ms. Numbers go in Pixelify Sans. */
export function formatReaction(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** "Noor", "Noor and Sam", "Noor, Sam and Kim". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The bottom panel, in the referee voice (spec, "Round flow and timings" and "Edge cases"). */
export function panelText(state: QuickDrawState): string {
  switch (state.phase) {
    case "intro":
      return state.round === 2 ? "Watch out for fakes" : "Tap your phone when the TV shouts DRAW";
    case "standoff":
    case "draw":
      return state.round === 1 ? "Wait for it…" : "Only DRAW! counts";
    case "result": {
      const names = state.players
        .filter((player) => state.winners.includes(player.id))
        .map((player) => player.name);
      if (names.length === 0) return "No winner this round";
      return `${listNames(names)} ${names.length === 1 ? "wins" : "win"} the round`;
    }
    case "over":
      return "That's the match";
  }
}

function currentCallout(state: QuickDrawState): CalloutPresentation | null {
  const { nowMs } = state;
  if (state.phase === "draw" && state.drawAtMs !== null) {
    return { text: "DRAW!", kind: "draw", ageMs: Math.max(0, nowMs - state.drawAtMs) };
  }
  if (state.phase !== "standoff") return null;
  const word = state.fakes.find(
    (fake) => fake.kind === "word" && showing(nowMs, fake.atMs, fakeWordShowMs),
  );
  return word?.word
    ? { text: word.word, kind: "fake", ageMs: Math.max(0, nowMs - word.atMs) }
    : null;
}

/** Fakes are only live during the standoff and draw of their own round. */
function liveFake(state: QuickDrawState, kind: Fake["kind"], lengthMs: number): Fake | undefined {
  if (state.phase !== "standoff" && state.phase !== "draw") return undefined;
  return state.fakes.find(
    (fake) => fake.kind === kind && showing(state.nowMs, fake.atMs, lengthMs),
  );
}

function pipLabel(
  state: QuickDrawState,
  result: TapResult | null,
  reducedMotion: boolean,
): PipLabel | null {
  if (result === null) return null;
  const inRound = state.phase === "standoff" || state.phase === "draw";
  const afterRound = state.phase === "result" || state.phase === "over";
  if (!inRound && !afterRound) return null;

  if (result.kind === "foul" || result.kind === "fooled") {
    const ageMs = result.atMs === null ? motion.foul.ms : state.nowMs - result.atMs;
    const wobbling = !reducedMotion && ageMs >= 0 && ageMs < motion.foul.ms;
    const offsetX = wobbling
      ? Math.round(
          Math.sin((ageMs / motion.foul.ms) * Math.PI * 4) * 2 * (1 - ageMs / motion.foul.ms),
        )
      : 0;
    return { text: "FOUL!", tone: "foul", offsetX };
  }
  // Times only appear with the result, so nobody learns another player's time during DRAW!.
  if (!afterRound) return null;
  return {
    text: result.ms === null ? "-.---" : formatReaction(result.ms),
    tone: "time",
    offsetX: 0,
  };
}

function pipExpression(state: QuickDrawState, player: QuickDrawPlayer): Expression {
  if ((state.phase !== "result" && state.phase !== "over") || player.left) return "neutral";
  return state.winners.includes(player.id) ? "happy" : "surprised";
}

/** Pips blink for one frame every 2.4 s during the standoff, each on its own beat. */
function blinking(state: QuickDrawState, index: number): boolean {
  return state.phase === "standoff" && (state.nowMs + index * 700) % 2400 < frameMs;
}

export function present(state: QuickDrawState, options: PresentOptions): Presentation {
  const { reducedMotion } = options;
  const slots = pipSlots(state.players.length);
  const elapsedMs = state.nowMs - state.phaseAtMs;
  const roundActive = state.phase === "standoff" || state.phase === "draw";
  const afterRound = state.phase === "result" || state.phase === "over";

  const crowFake = liveFake(state, "crow", crowShowMs);
  const glintFake = liveFake(state, "glint", glintShowMs);

  const pips = state.players.map((player, index): PipPresentation => {
    const result = roundActive || afterRound ? player.result : null;
    const won = afterRound && state.winners.includes(player.id);
    return {
      id: player.id,
      slot: slots[index] as PipSlot,
      points: player.points,
      left: player.left,
      pose: result?.atMs != null ? "drawn" : "ready",
      expression: pipExpression(state, player),
      blink: blinking(state, index),
      label: player.left ? null : pipLabel(state, result, reducedMotion),
      flag: won
        ? reducedMotion || state.phase === "over"
          ? 1
          : Math.min(1, elapsedMs / motion.ui.ms)
        : null,
    };
  });

  return {
    phase: state.phase,
    round: state.round,
    callout: currentCallout(state),
    crow: crowFake
      ? {
          // Flaps once as it lands, then sits. Reduced motion: no flapping.
          frame:
            reducedMotion || state.nowMs - crowFake.atMs >= 3 * frameMs
              ? 0
              : frameAt(state.nowMs - crowFake.atMs, 3),
        }
      : null,
    glint:
      glintFake?.playerId != null
        ? {
            playerId: glintFake.playerId,
            // Reduced motion: the sparkle doesn't twinkle.
            frame: reducedMotion ? 1 : frameAt(state.nowMs - glintFake.atMs, 3),
          }
        : null,
    tumbleweed:
      state.phase === "intro"
        ? {
            x: Math.round(-16 + (Math.min(elapsedMs, introMs) / introMs) * 512),
            frame: frameAt(elapsedMs, 4),
          }
        : null,
    dust:
      state.phase === "result" && state.winners.length > 0 && elapsedMs < dustShowMs
        ? { x: Math.round(150 + (elapsedMs / dustShowMs) * 180), frame: frameAt(elapsedMs, 4) }
        : null,
    panel: panelText(state),
    pips,
  };
}
