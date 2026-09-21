/**
 * Every tuned number in docs/games/bandeja.md, named so the rules read like the spec. Metres,
 * milliseconds and metres per second throughout, matching `@couchcade/physics`'s units.
 *
 * No `@couchcade/physics` import here (constants only): this file is reachable from
 * `../controller/Controller.vue` through `./view.ts`, and the phone must never reach the physics
 * package (dependency-cruiser's `game-controller-never-reaches-physics` rule). `physics.ts` turns
 * `ballDampingHalfLifeMs` into a damping coefficient with `floorFriction` itself, where the
 * package is already an allowed import.
 */

// --- Court, ball and walls ("Court, ball and walls") -------------------------------------------

/** `x` runs across the court, 0 at the TV's left wall to 10 at the right. */
export const courtMinX = 0;
export const courtMaxX = 10;
/** `y` runs along the court, 0 at side A's back wall to 20 at side B's. The net is at `y = 10`. */
export const courtMinY = 0;
export const courtMaxY = 20;
export const netY = 10;

export const ballId = "ball";
export const ballRadius = 0.033;
export const ballDensity = 16.4;
export const ballFriction = 0.2;
export const ballRestitution = 0.9;
/** The 6 s half-life is air drag. Turned into a damping coefficient by `physics.ts`. */
export const ballDampingHalfLifeMs = 6000;

/** "Glass panels are usually used for the back walls and the adjacent corner side sections." */
export const backGlassRestitution = 0.85;
export const cornerGlassRestitution = 0.85;
/** "metal mesh panels constitute the remainder of the sides". Mesh gives, so it kills a rebound. */
export const sideMeshRestitution = 0.55;
/** The corner glass covers `y` 0-4 and 16-20 on both side walls; the mesh covers 4-16. */
export const cornerGlassMaxY = 4;
export const cornerGlassMinY = courtMaxY - cornerGlassMaxY;

export const netRestitution = 0.1;
export const netWallId = "net";

/** "88 centimetres in height at the centre and 92 centimetres at the ends." */
export function netHeight(x: number): number {
  return 0.88 + (0.04 * Math.abs(x - 5)) / 5;
}

// --- Height (not a Planck value) ----------------------------------------------------------------

export const gravityMs2 = 9.81;
/** A floor bounce reflects `vz` at 75% and drops plan speed to 85% (turf grabs). */
export const floorBounceRestitution = 0.75;
export const floorBouncePlanSpeedFactor = 0.85;
/** "a ball above 2.6 m when a player swings" is always a whiff: it sailed over them. */
export const whiffMaxZ = 2.6;
/** The reach window `predict` looks for: 0 to 2.4 m of height. */
export const reachMaxZ = 2.4;
/** Serve contact height: hit underarm, at or below waist. */
export const serveContactZ = 0.9;
/** How long a serve takes to reach the ground at the aim point. */
export const serveFlightS = 1;

// --- Look-ahead ("Look-ahead") -------------------------------------------------------------------

export const predictMaxMs = 2500;
export const predictSteps = 150;

// --- Home spots and reach ("Home spots and reach") ------------------------------------------------

export type SlotName = "a-left" | "a-right" | "b-left" | "b-right" | "a-solo" | "b-solo";
export type Side = "a" | "b";

export interface SlotSpec {
  slot: SlotName;
  side: Side;
  home: readonly [x: number, y: number];
  reach: number;
}

export const doublesSlots: readonly SlotSpec[] = [
  { slot: "a-left", side: "a", home: [2.6, 6.4], reach: 2.4 },
  { slot: "a-right", side: "a", home: [7.4, 6.4], reach: 2.4 },
  { slot: "b-left", side: "b", home: [2.6, 13.6], reach: 2.4 },
  { slot: "b-right", side: "b", home: [7.4, 13.6], reach: 2.4 },
];

export const soloSlots: readonly SlotSpec[] = [
  { slot: "a-solo", side: "a", home: [5.0, 6.0], reach: 3.6 },
  { slot: "b-solo", side: "b", home: [5.0, 14.0], reach: 3.6 },
];

export const allSlotSpecs: readonly SlotSpec[] = [...doublesSlots, ...soloSlots];
export const slotSpecByName = new Map<SlotName, SlotSpec>(
  allSlotSpecs.map((spec) => [spec.slot, spec]),
);

/**
 * Which slots a match uses and in what seat order they fill (rule 2): 2 players are singles
 * (`a-solo`, `b-solo`); 3 and 4 are doubles filled `a-left`, `b-left`, `a-right`, `b-right`, with
 * `b-right` left empty (and auto-returning, [finding 1](../../../docs/games/bandeja.md)) at 3.
 */
export const seatOrderByCount: Readonly<Record<2 | 3 | 4, readonly SlotName[]>> = {
  2: ["a-solo", "b-solo"],
  3: ["a-left", "b-left", "a-right"],
  4: ["a-left", "b-left", "a-right", "b-right"],
};

/** The slots a match of this size ever has, occupied or not (doubles always has all four). */
export function slotsForCount(count: 2 | 3 | 4): readonly SlotName[] {
  return count === 2 ? soloSlots.map((spec) => spec.slot) : doublesSlots.map((spec) => spec.slot);
}

/** The diagonally opposite slot a serve targets (rule 4). Solo has one receiver on the other side. */
export const diagonalSlot: Readonly<Record<SlotName, SlotName>> = {
  "a-left": "b-right",
  "a-right": "b-left",
  "b-left": "a-right",
  "b-right": "a-left",
  "a-solo": "b-solo",
  "b-solo": "a-solo",
};

// --- Rules and scoring -----------------------------------------------------------------------

/** First side to this many points wins outright (owner decision 3). */
export const targetPoints = 7;
/** A match is capped at 6 minutes; the side ahead when it passes wins. */
export const matchMaxMs = 6 * 60 * 1000;
/** How far the serve's aim point is jittered from the diagonal slot's home spot. */
export const serveJitterX = 0.7;
export const serveJitterY = 0.5;
/** A rally that reaches this many shots starts the squeeze. */
export const squeezeStartShots = 30;
/** Reach shrinks 10% for every this many further shots. */
export const squeezeStepShots = 6;
export const squeezeStepFactor = 0.9;
export const squeezeMinReach = 0.8;
/** A rally this long ends the point outright (rule 9's own safety valve; never hit in the worked
 * model, since the squeeze makes a double bounce or net fault near-certain long before this).
 * 60 is still 7-10x the longest realistic rally in "Point flow and timings" (about 6-8 shots
 * typical, low double digits at worst) — comfortable margin over real play, while bounding how
 * long a pathological rally (two away/auto slots trading `ok`-grade returns forever, as a fuzzed
 * contract-test session can produce) keeps re-running predict's 150-step look-ahead on every hit. */
export const squeezeForceEndShots = 60;
/** A slot with no swing within 240 ms of its last 3 arrival moments is away (rule 10). */
export const awayAfterMisses = 3;
/** Straight down the middle, at the `ok` grade (rule 10). */
export const autoReturnSpeed = 0.5;
export const autoReturnAngle = 0;

// --- Point flow and timings ("Point flow and timings") -----------------------------------------

export const introMs = 4000;
export const serveMs = 900;
export const pointEndMs = 2600;
export const matchEndMs = 6000;
/** How long after the second floor bounce on one side the point is awarded (Fairness rule 3). */
export const pointSettleMs = 250;

// --- Swing timing and shots ("Swing timing and shots") ------------------------------------------

export type Grade = "clean" | "ok" | "mishit" | "whiff";

export interface GradeSpec {
  grade: Grade;
  /** Timing error band this grade covers, in ms: `(bandStart, bandEnd]`. */
  bandStart: number;
  bandEnd: number;
  planSpeed: number;
  lift: number;
  maxScatterDeg: number;
}

export const gradeSpecs: readonly GradeSpec[] = [
  { grade: "clean", bandStart: 0, bandEnd: 60, planSpeed: 14.0, lift: 3.2, maxScatterDeg: 0 },
  { grade: "ok", bandStart: 60, bandEnd: 140, planSpeed: 11.2, lift: 2.6, maxScatterDeg: 4 },
  { grade: "mishit", bandStart: 140, bandEnd: 240, planSpeed: 7.0, lift: 1.4, maxScatterDeg: 11 },
];
export const gradeSpecByName = new Map<Grade, GradeSpec>(
  gradeSpecs.map((spec) => [spec.grade, spec]),
);
/** Beyond this timing error (or no `arriveAt`, wrong side of the net, or `z` above `whiffMaxZ`) is
 * always a whiff. */
export const whiffErrorMs = 240;

/** A swing can move the pace by at most ±15% (`0.85 + 0.30 * speed`). */
export const paceBase = 0.85;
export const paceSpeedGain = 0.3;
/** `angle` clamps to ±60° before scaling; a clean line down the court turns by at most this. */
export const maxAimAngle = 60;
export const aimAngleGain = 22;

/** A whiff's send cooldown, enforced by the controller's own detector; the rules don't repeat it. */
export const whiffCooldownMs = 400;
