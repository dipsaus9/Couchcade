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
/** World px from the home to a full `yaw` of ±1 (±25° with the motion defaults). */
export const yawPx = 200;
/** World px from the home to a full `pitch` of ±1 (±15° with the motion defaults). */
export const pitchPx = 90;

/** The target centre lies in `x` 160 to 320 and `y` 110 to 160, in steps of 2 px. */
export const targetMinX = 160;
export const targetMaxX = 320;
export const targetMinY = 110;
export const targetMaxY = 160;
export const targetStepPx = 2;
/** A target centre this close to where a still phone lands at full draw is rolled again. */
export const stillShotClearancePx = 6;

/** The weakest draw that shoots. Below it the phone sends `lower`. */
export const minPower = 0.3;
