/**
 * The numbers from docs/games/quick-draw.md. The TV scene and the phone controller read them from
 * here too, so the rules and what players see never drift apart.
 */

/** Points that win the match. */
export const targetPoints = 3;
/** The match stops after this round even when nobody reached `targetPoints`. */
export const maxRounds = 9;

/** `intro`: the round chip and the tumbleweed. */
export const introMs = 1500;
/** `result`: times over every Pip, the winner in the bottom panel. */
export const resultMs = 3000;
/** `draw` lasts until every player has a result, or this long after DRAW!. */
export const drawWindowMs = 2000;

/** Every standoff lasts at least this many 60 Hz ticks (2,000 ms). */
export const standoffMinTicks = 120;
/** And at most this many (8,000 ms), the cap on the memoryless wait. */
export const standoffMaxTicks = 480;
/** After `standoffMinTicks`, each tick has a 1 in this chance of DRAW!. */
export const drawChanceDenominator = 90;

/** A reaction under this many ms after DRAW! is a foul, and so is every tap before it. */
export const falseStartMs = 100;
/** A reaction over this many ms is `slow`. */
export const slowMs = 1500;
/** A foul this soon after a fake is shown as "fooled". */
export const fooledWindowMs = 1000;

/** The first round with fake-outs. Round 1 is always plain. */
export const firstFakeRound = 2;
/** A fake lands at least this many ticks (1,000 ms) after the standoff starts, before DRAW! and from another fake. */
export const fakeGapTicks = 60;
/** Look-alike words. None contains DRAW and each differs from it by at least 2 letters or in length. */
export const fakeWords = ["DRIP!", "DRUM!", "DROP!", "DRY!", "DREAM!", "DRIFT!"] as const;
/** How long a fake word stays up on the TV. */
export const fakeWordShowMs = 600;
/** How long a popgun glint sparkles on the TV. */
export const glintShowMs = 300;
