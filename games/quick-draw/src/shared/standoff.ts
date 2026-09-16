import { createRng } from "@couchcade/utils";
import type { Rng } from "@couchcade/utils";
import {
  drawChanceDenominator,
  fakeGapTicks,
  fakeWords,
  firstFakeRound,
  standoffMaxTicks,
  standoffMinTicks,
} from "./constants.ts";
import { activePlayers } from "./state.ts";
import type { Fake, FakeKind, QuickDrawState } from "./state.ts";

/**
 * Ticks from the standoff start to DRAW!. After `standoffMinTicks`, every tick has a 1 in 90
 * chance, capped at `standoffMaxTicks`. A longer wait never tells a player DRAW! is close.
 */
export function rollDrawTicks(rng: Rng): number {
  for (let tick = standoffMinTicks + 1; tick < standoffMaxTicks; tick++) {
    if (rng.int(1, drawChanceDenominator) === 1) return tick;
  }
  return standoffMaxTicks;
}

/** From round 2: no fake in 30% of standoffs, 1 in 50% and 2 in 20%. */
export function rollFakeCount(rng: Rng, round: number): number {
  if (round < firstFakeRound) return 0;
  const roll = rng.int(1, 10);
  return roll <= 3 ? 0 : roll <= 8 ? 1 : 2;
}

/** A word in 50% of fakes, the crow in 25% and the glint in 25%. */
export function rollFakeKind(rng: Rng): FakeKind {
  const roll = rng.int(1, 4);
  return roll <= 2 ? "word" : roll === 3 ? "crow" : "glint";
}

/**
 * Ticks a new fake may land on: at least `fakeGapTicks` after the standoff starts, before DRAW!
 * and from every other fake. Empty when the standoff is too short, so the fake is dropped.
 */
export function freeFakeTicks(drawTicks: number, takenTicks: readonly number[]): number[] {
  const free: number[] = [];
  for (let tick = fakeGapTicks; tick <= drawTicks - fakeGapTicks; tick++) {
    if (takenTicks.every((taken) => Math.abs(tick - taken) >= fakeGapTicks)) free.push(tick);
  }
  return free;
}

/** The six words in the order of one cycle. Each cycle is a new shuffle. */
function wordCycle(wordSeed: number, cycle: number): string[] {
  const seed = (wordSeed ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0;
  return createRng(seed).shuffle(fakeWords);
}

/**
 * The fake word shown as the `index`-th word of the match. Every word is shown once before any
 * word repeats, and a new cycle never starts with the word the last one ended with.
 */
export function fakeWordAt(wordSeed: number, index: number): string {
  const cycleLength = fakeWords.length;
  let order = wordCycle(wordSeed, 0);
  for (let cycle = 1; cycle <= Math.floor(index / cycleLength); cycle++) {
    const next = wordCycle(wordSeed, cycle);
    const [first, second] = next as [string, string];
    if (first === order[cycleLength - 1]) [next[0], next[1]] = [second, first];
    order = next;
  }
  return order[index % cycleLength] as string;
}

/**
 * Starts a round's standoff at `state.nowMs`: rolls when DRAW! comes, then the fakes around it,
 * all from the seeded RNG. Clears the previous round's results.
 */
export function startStandoff(state: QuickDrawState, dtMs: number): QuickDrawState {
  const rng = createRng(state.rng);
  const startMs = state.nowMs;
  const drawTicks = rollDrawTicks(rng);

  const fakeTicks: number[] = [];
  const fakes: Fake[] = [];
  let wordsShown = state.wordsShown;
  const fakeCount = rollFakeCount(rng, state.round);
  for (let i = 0; i < fakeCount; i++) {
    const free = freeFakeTicks(drawTicks, fakeTicks);
    if (free.length === 0) continue;
    const tick = rng.pick(free);
    const kind = rollFakeKind(rng);
    fakeTicks.push(tick);
    fakes.push({
      atMs: startMs + tick * dtMs,
      kind,
      word: kind === "word" ? fakeWordAt(state.wordSeed, wordsShown++) : null,
      playerId: kind === "glint" ? rng.pick(activePlayers(state)).id : null,
    });
  }
  fakes.sort((a, b) => a.atMs - b.atMs);

  return {
    ...state,
    phase: "standoff",
    phaseAtMs: startMs,
    drawDueMs: startMs + drawTicks * dtMs,
    drawAtMs: null,
    fakes,
    players: state.players.map((player) => ({ ...player, result: null })),
    winners: [],
    rng: rng.state,
    wordsShown,
    roundStart: { rng: state.rng, wordsShown: state.wordsShown },
  };
}
