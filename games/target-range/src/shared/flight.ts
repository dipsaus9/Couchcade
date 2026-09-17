import type { Aim } from "@couchcade/game-sdk/input";
import { aimHomeX, aimHomeY, bullseyePoints, pitchPx, yawPx } from "./constants.ts";
import type { RoundRules } from "./constants.ts";

/** Where an arrow lands and how long it flies. */
export interface Landing {
  /** World px, rounded to 0.1 px. */
  x: number;
  y: number;
  flightMs: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The world point the phone aims at: `(240 + yaw × 200, 140 − pitch × 90)`. */
export function aimPoint(aim: Aim): Point {
  return { x: aimHomeX + aim.yaw * yawPx, y: aimHomeY - aim.pitch * pitchPx };
}

/**
 * The closed-form arrow flight from docs/games/target-range.md, "Arrow flight". A weaker draw
 * flies longer, so it drops with the square of the stretch and drifts with the stretch. `wind` is
 * signed, right is positive.
 */
export function flyArrow(round: RoundRules, aim: Aim, power: number, wind: number): Landing {
  const from = aimPoint(aim);
  const flightMs = Math.round(round.baseMs / (0.4 + 0.6 * power));
  const stretch = flightMs / round.baseMs;
  return {
    x: toTenth(from.x + wind * round.windPx * stretch),
    y: toTenth(from.y + round.dropPx * stretch * stretch),
    flightMs,
  };
}

/**
 * Points for an arrow landing at `(x, y)`: ring `k` when the distance is at most
 * `radius × (11 − k) / 10`, taking the highest such `k`, and 0 outside the target. It works in
 * whole tenths of a pixel and compares squared distances, so there are no square roots and replays
 * are exact.
 */
export function arrowPoints(target: Point, radius: number, x: number, y: number): number {
  const dx = Math.round(x * 10) - Math.round(target.x * 10);
  const dy = Math.round(y * 10) - Math.round(target.y * 10);
  const distanceSquared = dx * dx + dy * dy;
  for (let ring = bullseyePoints; ring >= 1; ring--) {
    const reach = radius * (11 - ring);
    if (distanceSquared <= reach * reach) return ring;
  }
  return 0;
}

function toTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
