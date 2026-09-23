/**
 * The real CPU (docs/games/bandeja.md rule 10): "An auto-returning slot hits every ball it can
 * reach at the `ok` grade, straight down the middle... This is a stand-in, not an opponent: it has
 * no movement, no difficulty, and no aim. CC-23.8 replaces it with the real CPU." Movement is
 * `positions.ts`'s job; this file is the difficulty and the aim. `rules.ts`'s `performAutoHit`
 * calls `cpuShot` instead of always launching the ball at a fixed grade and angle.
 *
 * Fairness rule 4 and rule 14 ("Randomness") keep Bandeja's only randomness in the serve jitter, so
 * the CPU's "difficulty" cannot be a random roll: the same match always plays out the same way. It
 * is instead a fixed, named skill level, expressed as a reaction offset that is graded through the
 * exact same clean/ok/mishit timing bands a human swing uses - so a CPU's shot quality reads on the
 * same scale a player's does - and an aim that reads the court (which half of the receiving side is
 * covered least) rather than a coin flip.
 */
import { aimAngleGain, autoReturnSpeed, gradeSpecs } from "../constants.ts";
import type { Grade, Side, SlotSpec } from "../constants.ts";
import { isAutoSlot, matchSlotSpecs, otherSide } from "../state.ts";
import type { BandejaState } from "../state.ts";

export interface CpuDifficulty {
  /** How far off the ball's arrival moment the CPU's simulated reaction lands. Always graded by
   * its absolute value through the same bands a human's timing error is (Swing timing and shots). */
  reactionMs: number;
  /** 0 (always aims dead centre) to 1 (aims as hard into the gap as a human's own max aim). */
  aimStrength: number;
}

/**
 * The one difficulty CC-23.8 ships - "a set difficulty", not a selectable one (AC2). `reactionMs`
 * sits inside the `ok` band: never a gift (a `clean` return every time would make an auto-filled
 * slot the strongest player at the table), never hopeless either. A future story can turn this into
 * a per-match choice without touching how a shot is graded or aimed.
 */
export const cpuDifficulty: CpuDifficulty = { reactionMs: 90, aimStrength: 0.6 };

/** The same clean/ok/mishit/whiff bands `rules.ts` grades a human swing's timing error with
 * (Swing timing and shots), applied to the CPU's fixed reaction instead of a player's `actedMs`. */
export function gradeForReaction(reactionMs: number): Grade {
  const abs = Math.abs(reactionMs);
  for (const spec of gradeSpecs) {
    if (abs <= spec.bandEnd) return spec.grade;
  }
  return "whiff";
}

/**
 * Which lateral half of `receiving`'s court is covered least right now: -1 (the TV's left), 1 (the
 * TV's right), or 0 when it's a wash. An auto slot (nobody seated, they left, or they're away -
 * `isAutoSlot`) contributes nothing: it's not a real defender to find a gap around, which is what
 * turns a 3-player match's empty slot, or a doubles partner who's stopped responding, into a real
 * target instead of a symmetric non-decision. A dead-centre home spot (singles) splits its reach
 * evenly between both halves, since there is no lateral side to prefer there. Weighted by each
 * covering slot's own reach, so a squeezed-down reach (rule 9) reads as weaker coverage too.
 * Deterministic: a pure function of the match's own state, never a die roll.
 */
function weakerSideSign(state: BandejaState, receiving: Side): -1 | 0 | 1 {
  const centreX = 5;
  let leftCoverage = 0;
  let rightCoverage = 0;
  for (const spec of matchSlotSpecs(state)) {
    if (spec.side !== receiving || isAutoSlot(state, spec.slot)) continue;
    const dx = spec.home[0] - centreX;
    if (Math.abs(dx) < 1e-9) {
      leftCoverage += spec.reach / 2;
      rightCoverage += spec.reach / 2;
    } else if (dx < 0) {
      leftCoverage += spec.reach;
    } else {
      rightCoverage += spec.reach;
    }
  }
  if (leftCoverage === rightCoverage) return 0;
  return leftCoverage < rightCoverage ? -1 : 1;
}

/** The auto-returning `spec`'s shot right now: a grade from the fixed difficulty's reaction, and
 * an aim toward whichever half of the receiving side it covers least. */
export function cpuShot(
  state: BandejaState,
  spec: SlotSpec,
): { grade: Grade; angleDeg: number; speed: number } {
  const grade = gradeForReaction(cpuDifficulty.reactionMs);
  const sign = weakerSideSign(state, otherSide(spec.side));
  const angleDeg = sign * cpuDifficulty.aimStrength * aimAngleGain;
  return { grade, angleDeg, speed: autoReturnSpeed };
}
