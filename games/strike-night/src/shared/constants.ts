/**
 * The numbers from docs/games/strike-night.md. The TV scene and the phone controller read them
 * from here too, so the rules and what players see never drift apart. Units are metres, seconds,
 * kilograms and newtons, as `@couchcade/physics` expects ("Ball and pins").
 *
 * This file never imports `@couchcade/physics` itself (only `physics.ts` does): the phone
 * controller type-imports `input.ts`, which imports `maxTurns` from here, and
 * `game-controller-never-reaches-physics` (.dependency-cruiser.cjs) checks that nothing under
 * `src/controller/` reaches Planck through `shared/`, even transitively.
 */
import { maxInputAgeMs } from "@couchcade/game-sdk/contract";

/** 1 to 4 seated players, owner decision 2 (docs/games/strike-night.md). Set directly on
 * `defineGame({ players })` in src/index.ts, so it isn't repeated here under another name. */
const maxTableSeats = 4;

/** Every player bowls this many frames, whatever the player count (owner decision 2). */
export const frameCount = 10;
/** A frame is roll 1 and, unless it was a strike, roll 2. */
export const rollsPerFrame = 2;
/** The most rolls in a match: 4 players x 10 frames x 2, the `turn` schema's cap. */
export const maxTurns = maxTableSeats * frameCount * rollsPerFrame;

/** Current-frame scoring (owner decision 1): a strike is fixed at 30, whatever follows it. */
export const strikeScore = 30;
/** Bonus added to roll 1's pins for a spare. */
export const spareBonus = 10;
/** A perfect game: 10 strikes, `frameCount * strikeScore`. */
export const perfectGameScore = frameCount * strikeScore;

// --- Turn flow and timings ---------------------------------------------------------------

/** `intro`: the approach shot and the title chip. */
export const introMs = 3000;
/** Every roll's turn timer, from the start of `lineup`. */
export const turnTimerMs = 20_000;
/** An away player's shortened timer (edge cases, rule 7). */
export const awayTurnTimerMs = 5000;
/** The auto-roll fires this long after the deadline, the platform's late-input wait. */
export const autoRollWaitMs = maxInputAgeMs;
/** An accepted input from an away bowler pushes the deadline to this long after it. */
export const awayInputExtensionMs = 15_000;
/** A player whose last this-many rolls were auto-rolls is away. */
export const awayAfterAutoRolls = 2;
/** The auto-roll: the bowler's current position, gentle speed, straight, no hook. */
export const autoRollSpeed = 0.3;
export const autoRollAngle = 0;
export const autoRollSpin = 0;

/** `result`: the pin count and, when nothing was earned, nothing else. */
export const resultMs = 1500;
/** `result` with a STRIKE!, SPARE! or TURKEY! callout. */
export const resultWithCalloutMs = 2500;
/** `frameEnd`: the scorecard, frames left. */
export const frameEndMs = 2500;
/** `frameEnd` after the last frame, before the match ends. */
export const frameEndLastMs = 4000;
/** `rolling` never runs longer than this after release ("Gutters, settling and counting"). */
export const rollingMaxMs = 8000;
/** `rolling` ends this long after the ball first reaches the pins (`pinsReachedY`). */
export const settleAfterPinsMs = 2500;

// --- The lane ------------------------------------------------------------------------------

/** Foul line to head pin. */
export const headPinY = 18.29;
/** Left and right edges of the lane. */
export const laneMinX = 0;
export const laneMaxX = 1.054;
export const laneCenterX = 0.527;
/** A ball whose centre crosses the lane edge before this `y` is a gutter ball. */
export const gutterBeforeY = 17.9;
/** A body whose `y` passes this leaves the world: the pit. */
export const pitY = 19.4;
/** Neighbouring pins are this far apart, real ten-pin spacing. */
export const pinSpacing = 0.3048;
export const pinRowSpacing = 0.264;

export interface PinSpot {
  id: string;
  x: number;
  y: number;
}

/** The 10 pin spots: head pin at (laneCenterX, headPinY), 4 rows of 1, 2, 3, 4. */
export const pinSpots: readonly PinSpot[] = Array.from({ length: 4 }, (_row, r) =>
  Array.from({ length: r + 1 }, (_col, c) => ({
    id: `p${r}-${c}`,
    x: laneCenterX + (c - r / 2) * pinSpacing,
    y: headPinY + r * pinRowSpacing,
  })),
).flat();

/** Kickbacks: static walls beyond the gutters that bounce pins back into the deck. */
export const kickbackLeftX = -0.235;
export const kickbackRightX = 1.289;
export const kickbackMinY = 17;
export const kickbackMaxY = 19.6;
export const kickbackRestitution = 0.4;

// --- Ball and pins (bodies) ------------------------------------------------------------------

export const ballId = "ball";
export const ballRadius = 0.108;
export const ballDensity = 191;
export const ballFriction = 0.2;
export const ballRestitution = 0.1;
/** The floor friction half-life: an 8 s half-life slows a full-speed ball 9 -> 7.4 m/s. Turned
 * into `linearDamping` by `floorFriction` in physics.ts, which is the only file here that may
 * import `@couchcade/physics`. */
export const ballDampingHalfLifeMs = 8000;

export const pinRadius = 0.06;
export const pinDensity = 141;
export const pinFriction = 0.2;
export const pinRestitution = 0.5;
/** A 600 ms half-life lets hit pins slide into their neighbours. */
export const pinDampingHalfLifeMs = 600;

/** Once a pin's speed passes this, it is falling for the rest of the roll. */
export const fallingSpeed = 0.5;
/** A falling pin's spec becomes wider and lighter (same mass), sweeping more floor. */
export const fallingPinRadius = 0.08;
export const fallingPinDensity = 79;

/** A pin down at the end of the roll: in the pit, falling, or this far from its spot. */
export const downDistance = 0.04;

// --- Throwing --------------------------------------------------------------------------------

/** Speed range at release: 4.5 (10 mph) to 9 m/s (20 mph). */
export const minThrowSpeed = 4.5;
export const throwSpeedRange = 4.5;
/** The swing's `angle` is clamped to this before `aimGain` scales it to degrees off straight. */
export const maxAimAngle = 30;
/**
 * Degrees off straight per degree of clamped swing angle: +-1.5 deg of direction at the full
 * +-30 deg swing. Tunable per docs/games/strike-night.md, "Fairness" rule 7 and owner decision 3:
 * if real traces show the swing angle is too noisy, this drops, and at 0 the ball starts straight.
 */
export const aimGain = 0.05;
/** The ball hooks from this `y` on: the last ~40 ft, where a real lane runs dry. */
export const hookFromY = 12.2;
/** Hook force per kg, per unit spin, per (m/s)^2 of speed: a radius-50 m curve at full spin. */
export const hookForceFactor = 0.02;

/** `x = ±1` reaches this fraction of the lane's half-width from the centre at the start. */
export const startXRange = 0.41;
export const startY = 0.3;
