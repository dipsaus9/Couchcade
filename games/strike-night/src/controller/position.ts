/**
 * Where the bowler stands (docs/games/strike-night.md, "Lining up"): touching or dragging the
 * move bar puts the ball under the finger, rounded to 0.05 so there are 41 spots about 2 cm apart.
 *
 * `CcDragSlider` already does the spec's `clamp((pointerX − stripCentre) / (stripWidth / 2), −1,
 * 1)`: its own pointer math is `clamp((pointerX − trackLeft) / trackWidth, 0, 1)`, the same clamp
 * expressed around the strip's left edge instead of its centre. This turns that 0..1 value back
 * into the −1..1 position the game state and the input schema use, and rounds it.
 */
export function positionOf(sliderValue: number): number {
  const x = Math.min(1, Math.max(0, sliderValue)) * 2 - 1;
  const rounded = Math.round(x / 0.05) * 0.05;
  const clamped = Math.min(1, Math.max(-1, rounded));
  // Rounds away any float noise (0.15000000000000002) and drops -0.
  return Math.round(clamped * 100) / 100 + 0;
}
