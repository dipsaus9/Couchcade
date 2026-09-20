/**
 * The numbers from docs/games/target-range.md. The TV scene and the phone controller read them
 * from here too, so the rules and what players see never drift apart.
 */
import { maxInputAgeMs } from "@couchcade/game-sdk/contract";

/** One of the four fixed rounds ("Rules and scoring", rule 2, and "Arrow flight"). */
export interface RoundRules {
  /** Shown on the TV and the phone: "Round 2 · middle". */
  name: string;
  /** Target radius in world px. Ring `k` reaches `radius × (11 − k) / 10`. */
  radius: number;
  /** Wind strength range, whole numbers, both inclusive. */
  windMin: number;
  windMax: number;
  /** How far an arrow drops at full draw, in world px. */
  dropPx: number;
  /** Flight time at full draw. */
  baseMs: number;
  /** Sideways drift per wind strength at full draw, in world px. */
  windPx: number;
}

export const rounds: readonly RoundRules[] = [
  { name: "near", radius: 36, windMin: 0, windMax: 0, dropPx: 4, baseMs: 350, windPx: 0 },
  { name: "middle", radius: 30, windMin: 0, windMax: 2, dropPx: 8, baseMs: 500, windPx: 3 },
  { name: "far", radius: 24, windMin: 1, windMax: 3, dropPx: 14, baseMs: 650, windPx: 4 },
  { name: "far and gusty", radius: 24, windMin: 2, windMax: 4, dropPx: 14, baseMs: 650, windPx: 4 },
];

/** Rounds in a match. */
export const roundCount = rounds.length;
/** Arrows per round. Each arrow is one volley. */
export const arrowsPerRound = 3;
/** Volleys in a match: 12. */
export const volleyCount = roundCount * arrowsPerRound;
/** Points for the gold centre, a "bullseye". */
export const bullseyePoints = 10;
/** A perfect match: 120. */
export const maxMatchPoints = volleyCount * bullseyePoints;

/** `intro`: the round chip, the target sliding in and the first wind. */
export const introMs = 2500;
/** `open` lasts until every player shot, or this long. */
export const volleyMs = 10_000;
/** After a volley timed out, `landing` waits this long for shots still on their way (500 ms). */
export const lateWaitMs = maxInputAgeMs;
/** `reveal`: every arrow's points. */
export const revealMs = 1500;
/** `roundEnd`: the leader, arrows pulled from the target. */
export const roundEndMs = 3000;

/** The TV world the target and the landing points live in. */
export const worldWidth = 480;
export const worldHeight = 270;
/** Where the crosshair sits when `yaw = 0` and `pitch = 0`. */
export const aimHomeX = 240;
export const aimHomeY = 140;
/** World px from the home to a full `yaw` of ±1. */
export const yawPx = 200;
/** World px from the home to a full `pitch` of ±1. */
export const pitchPx = 90;

/**
 * World px of aim movement per degree the phone turns, in both directions (owner decision,
 * docs/architecture/realtime-link.md, "Tuning Target Range's aim speed"). The controller derives
 * `yawRangeDeg` (33.3°) and `pitchRangeDeg` (15°) from this and `yawPx`/`pitchPx` and passes them
 * to `createAimDetector`, so yaw and pitch feel the same speed instead of yaw's old third-faster
 * 8 px/degree.
 */
export const aimPxPerDegree = 6;
/** World px of aim movement per CSS px of touch-pad drag, in both directions (same tuning). */
export const padPxPerCssPx = 1.5;

/** The target centre's `x` always lies in 160 to 320, in steps of 2 px. */
export const targetMinX = 160;
export const targetMaxX = 320;
/** The target centre's `y` always reaches this far toward the horizon (the farthest it ever rolls). */
export const targetMinY = 110;
/** Round 1's near edge: how close to the couch (how large a `y`) the target may roll, unchanged. */
export const targetMaxYNear = 160;
export const targetStepPx = 2;

/**
 * How close to the couch (how large a `y`) the target may roll for a round of this `radius`: the
 * full window for round 1 (radius 36, the nearest), capped progressively closer to the horizon as
 * a later round's physics distance grows (docs/games/target-range.md, "Target"). Round 1's target
 * still rolls anywhere from 110 to 160; round 4's (radius 24) is capped near 144. Without this, the
 * target's on-screen depth rolled independently of the round's radius/drop/flight-time/wind, so a
 * later, physically farther round could land visually closer than an earlier one (CC-11.11).
 */
export function targetMaxY(radius: number): number {
  const span = targetMaxYNear - targetMinY;
  const nearRadius = (rounds[0] as RoundRules).radius;
  const steps = Math.round((span * radius) / (nearRadius * targetStepPx));
  return targetMinY + steps * targetStepPx;
}

/** A target centre this close to where a still phone lands at full draw is rolled again. */
export const stillShotClearancePx = 6;

/** The weakest draw that shoots. Below it the phone sends `lower`. */
export const minPower = 0.3;
