/**
 * What the TV shows right now (docs/games/strike-night.md, "TV scene" and "Turn flow and
 * timings"). Pure and framework-free, so a whole presentation is a plain data assertion, the same
 * split Quick Draw and Target Range's `present.ts` use.
 *
 * Two pieces of this can't come from `state` alone, because `@couchcade/physics` drops a body the
 * moment it leaves the tracked world (`shared/physics.ts`): a gutter ball ("the scene rolls it on
 * down the gutter at its speed") and the fallen pins lying on the deck through `result` (before
 * the next lineup's sweep). The scene keeps a small `RollCache` of the last live roll for that,
 * cleared the moment a new `lineup` starts; `present` only reads it, never builds it.
 */
import {
  allPinIds,
  findPlayer,
  findPlayerBySeat,
  frameCount,
  pinSpots,
  pitY,
  type FrameRecord,
  type PinRuntime,
  type StrikeNightPlayer,
  type StrikeNightState,
} from "../shared/index.ts";
import {
  approachBallSize,
  approachPinSize,
  type LanePoint,
  pinShotBallSize,
  pinShotFromY,
  pinShotPinSize,
  toApproach,
  toPinShot,
} from "./layout.ts";

/** The ball's last live lane position and velocity, kept so a gutter ball can keep moving on
 * screen after `shared/physics.ts` drops it. */
export interface LastBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Game time this was captured. */
  atMs: number;
}

/** What the scene remembers from the last roll (docs above). Cleared at each new `lineup`. */
export interface RollCache {
  pins: readonly PinRuntime[];
  ball: LastBall | null;
  gutter: boolean;
  gutterEndAtMs: number | null;
}

export type Shot = "approach" | "pin";

export interface BallView {
  x: number;
  y: number;
  size: number;
}

export interface PinView {
  id: string;
  x: number;
  y: number;
  size: { width: number; height: number };
  /** Falling or already down: a placeholder tints it until CC-12.5's tumble frames land. */
  down: boolean;
}

export interface PipView {
  id: string;
  x: number;
  y: number;
  /** True for the bowler holding the ball up (`grip`). */
  holding: boolean;
}

export type Callout = "STRIKE!" | "SPARE!" | "TURKEY!";

export interface PinMapDot {
  standing: boolean;
}

export interface ScorecardRow {
  id: string;
  name: string;
  /** `@couchcade/stage`'s `players` token index for the row's shape mark: this game's own seat,
   * since `present` never sees the platform's `PlayerInfo.slot`. The scene remaps it to that
   * before drawing, the same identity the World Pips and the scoreboard chips use. */
  slot: number;
  /** One cell per frame, straight from `FrameRecord`: the overlay derives "X", "7 /" or "7 2"
   * from `roll1`/`roll2` itself, the same numbers the spec's "Mark on the TV" column shows. */
  frames: readonly FrameRecord[];
  total: number;
}

export interface Presentation {
  shot: Shot;
  ball: BallView | null;
  pins: readonly PinView[];
  bowler: PipView | null;
  bench: readonly PipView[];
  /** The bottom instruction panel's one line, under 40 characters. */
  panel: string;
  /** Seconds left, shown only in the turn timer's last 5. */
  clock: number | null;
  pinMap: readonly PinMapDot[] | null;
  scorecard: readonly ScorecardRow[] | null;
  callout: Callout | null;
  frame: { current: number; total: number };
}

const noCache: RollCache = { pins: [], ball: null, gutter: false, gutterEndAtMs: null };

/** The ball's effective lane position right now: live, extrapolated down the gutter, or gone. */
function ballLanePoint(state: StrikeNightState, cache: RollCache): LanePoint | null {
  const roll = state.activeRoll;
  if (roll === null) return null;
  if (roll.ball !== null) return roll.ball;
  if (!roll.gutter || cache.ball === null) return null;
  if (cache.gutterEndAtMs !== null && state.nowMs >= cache.gutterEndAtMs) return null;
  const dtS = (state.nowMs - cache.ball.atMs) / 1000;
  const y = Math.min(pitY, cache.ball.y + cache.ball.vy * dtS);
  return { x: cache.ball.x + cache.ball.vx * dtS, y };
}

/** Approach shot until the ball passes `y = 16`; the pin shot from there through `result`. */
function shotFor(state: StrikeNightState, ballAt: LanePoint | null): Shot {
  if (state.phase === "result") return "pin";
  if (state.phase !== "rolling") return "approach";
  if (ballAt !== null && ballAt.y < pinShotFromY) return "approach";
  return "pin";
}

function project(shot: Shot, point: LanePoint): { x: number; y: number } {
  return shot === "approach" ? toApproach(point) : toPinShot(point);
}

function ballView(shot: Shot, ballAt: LanePoint | null): BallView | null {
  if (ballAt === null) return null;
  const at = project(shot, ballAt);
  const size = shot === "approach" ? approachBallSize(ballAt.y) : pinShotBallSize;
  return { x: at.x, y: at.y, size };
}

const spotById = new Map(pinSpots.map((spot) => [spot.id, spot] as const));

function pinViews(state: StrikeNightState, cache: RollCache, shot: Shot): PinView[] {
  const size = shot === "approach" ? approachPinSize : pinShotPinSize;
  const roll = state.activeRoll;
  if (roll !== null) {
    return roll.pins
      .filter((pin) => pin.body !== null)
      .map((pin) => {
        const at = project(shot, pin.body as { x: number; y: number });
        return { id: pin.id, x: at.x, y: at.y, size, down: pin.fell };
      });
  }
  const standing = new Set(state.standingPins);
  const views: PinView[] = [];
  for (const id of allPinIds) {
    if (!standing.has(id)) continue;
    const spot = spotById.get(id);
    if (spot === undefined) continue;
    const at = project(shot, spot);
    views.push({ id, x: at.x, y: at.y, size, down: false });
  }
  // Fallen pins from the last roll still lie on the deck through `result`, until the next
  // lineup's sweep (docs/games/strike-night.md, "Ball and pins", "Sweep").
  if (state.phase === "result") {
    for (const pin of cache.pins) {
      if (!pin.fell || pin.body === null || standing.has(pin.id)) continue;
      const at = project(shot, pin.body);
      views.push({ id: pin.id, x: at.x, y: at.y, size, down: true });
    }
  }
  return views;
}

/** A player's frame row for the scorecard: `FrameRecord`s straight through, so the overlay can
 * show the spec's own "Mark on the TV" text ("X", "7 /", "7 2") from `roll1`/`roll2` itself. */
function scorecardRow(player: StrikeNightPlayer): ScorecardRow {
  return {
    id: player.id,
    name: player.name,
    slot: player.seat,
    frames: player.frames,
    total: player.total,
  };
}

/** A strike is a TURKEY! when it's the third in a row (docs/games/strike-night.md, "Callouts"). */
function isTurkey(player: StrikeNightPlayer, frame: number): boolean {
  if (frame < 3) return false;
  const strikeAt = (n: number): boolean => player.frames[n - 1]?.roll1 === 10;
  return strikeAt(frame) && strikeAt(frame - 1) && strikeAt(frame - 2);
}

/** `STRIKE!`/`SPARE!`/`TURKEY!` pop 400 ms after the pin count, and never for a gutter or open
 * frame (docs/games/strike-night.md, "Callouts" and "Readability from the couch" rule 5). */
function calloutFor(state: StrikeNightState): Callout | null {
  if (state.phase !== "result") return null;
  if (state.nowMs - state.phaseAtMs < 400) return null;
  const bowler = findPlayer(state, state.bowlerId);
  const last = bowler?.last;
  if (bowler === undefined || last === null || last === undefined) return null;
  if (last.mark === "spare") return "SPARE!";
  if (last.mark !== "strike") return null;
  return isTurkey(bowler, state.frame) ? "TURKEY!" : "STRIKE!";
}

function panelFor(state: StrikeNightState): string {
  if (state.phase === "intro") return "Hold the ball, swing, let go";
  if (state.phase === "frameEnd" || state.phase === "over") {
    const leader = state.players
      .filter((player) => !player.left)
      .toSorted((a, b) => b.total - a.total)[0];
    return leader === undefined ? "" : `${leader.name} leads with ${leader.total}`;
  }
  const bowler = findPlayer(state, state.bowlerId);
  return bowler === undefined ? "" : `${bowler.name} is up`;
}

/** Seconds left in the turn timer, shown only in the last 5 (docs/games/strike-night.md,
 * "lineup", "A clock chip counts down the last 5 seconds with a tick each second"). */
function clockFor(state: StrikeNightState): number | null {
  if (state.phase !== "lineup" || state.deadlineMs === null) return null;
  const remainingMs = state.deadlineMs - state.nowMs;
  if (remainingMs <= 0 || remainingMs > 5000) return null;
  return Math.ceil(remainingMs / 1000);
}

function pinMapFor(state: StrikeNightState): readonly PinMapDot[] | null {
  const roll2Lineup = state.phase === "lineup" && state.roll === 2;
  if (!roll2Lineup && state.phase !== "result") return null;
  const standing = new Set(state.standingPins);
  return allPinIds.map((id) => ({ standing: standing.has(id) }));
}

function scorecardFor(state: StrikeNightState): readonly ScorecardRow[] | null {
  if (state.phase !== "frameEnd") return null;
  return state.players.toSorted((a, b) => a.seat - b.seat).map((player) => scorecardRow(player));
}

/**
 * Where the bowler and everyone else stand. The bowler's position is a real spot on the lane, so
 * it goes through the current shot's projection like the ball and the pins. The bench sits off to
 * the side, not on the lane itself, so its seats are already in world screen space (`layout.ts`'s
 * `benchSlots`).
 */
export interface Places {
  bowler: { id: string; point: LanePoint; holding: boolean } | null;
  bench: readonly { id: string; x: number; y: number }[];
}

export function present(
  state: StrikeNightState,
  cache: RollCache = noCache,
  places: Places = { bowler: null, bench: [] },
): Presentation {
  const ballAt = ballLanePoint(state, cache);
  const shot = shotFor(state, ballAt);
  const showBowlerAndBench = shot === "approach";

  const bowler =
    showBowlerAndBench && places.bowler !== null
      ? {
          id: places.bowler.id,
          ...project(shot, places.bowler.point),
          holding: places.bowler.holding,
        }
      : null;
  const bench = showBowlerAndBench
    ? places.bench.map((seat) => ({ id: seat.id, x: seat.x, y: seat.y, holding: false }))
    : [];

  return {
    shot,
    ball: ballView(shot, ballAt),
    pins: pinViews(state, cache, shot),
    bowler,
    bench,
    panel: panelFor(state),
    clock: clockFor(state),
    pinMap: pinMapFor(state),
    scorecard: scorecardFor(state),
    callout: calloutFor(state),
    frame: { current: state.frame, total: frameCount },
  };
}

/** The next bowler after the current one, for the bench (mirrors `shared/view.ts`'s helper; kept
 * local since the host never imports the controller's view module). */
export function nextBowlerId(state: StrikeNightState): string | null {
  const seats = state.players.filter((player) => !player.left).map((player) => player.seat);
  if (seats.length === 0) return null;
  const bowler = findPlayer(state, state.bowlerId);
  const currentSeat = bowler?.seat ?? -1;
  const nextSeat = seats.find((seat) => seat > currentSeat) ?? Math.min(...seats);
  return findPlayerBySeat(state, nextSeat)?.id ?? null;
}
