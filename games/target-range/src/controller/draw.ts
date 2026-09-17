/**
 * The pull to draw (docs/games/target-range.md, "Motion controls", Power). Pure, so the power curve
 * is a plain data test.
 */
import { minPower } from "../shared/constants.ts";

/** CSS px of pull down from the touch point that gives full power: a firm pull. */
export const fullDrawPx = 150;

/** `clamp(pull / 150, 0, 1)` rounded to 2 decimals. Pulling up or past 150 px adds nothing. */
export function powerOf(pullPx: number): number {
  const power = Math.min(1, Math.max(0, pullPx / fullDrawPx));
  return Math.round(power * 100) / 100 + 0;
}

/** True when a release at `power` shoots. Below 0.3 the phone lowers the bow instead. */
export function shoots(power: number): boolean {
  return power >= minPower;
}
