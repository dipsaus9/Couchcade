import type { InputContext, Player } from "@couchcade/game-sdk/contract";
import { addSample } from "@couchcade/game-sdk/input";
import {
  arrowsPerRound,
  bullseyePoints,
  introMs,
  lateWaitMs,
  revealMs,
  roundCount,
  roundEndMs,
  volleyMs,
} from "./constants.ts";
import { arrowPoints, flyArrow } from "./flight.ts";
import type { AimInput, LowerInput, ShootInput, TargetRangeInput } from "./input.ts";
import {
  activePlayers,
  currentWind,
  findPlayer,
  roundRules,
  startRound,
  volleyOf,
} from "./state.ts";
import type { Arrow, TargetRangePlayer, TargetRangeState } from "./state.ts";

/** The state with one player changed. */
function updatePlayer(
  state: TargetRangeState,
  id: string,
  change: Partial<TargetRangePlayer>,
): TargetRangeState {
  return {
    ...state,
    players: state.players.map((player) => (player.id === id ? { ...player, ...change } : player)),
  };
}

/** One aim sample while the volley is open and the player hasn't shot: the crosshair shows. */
function applyAim(
  state: TargetRangeState,
  player: TargetRangePlayer,
  input: AimInput,
  ctx: InputContext,
): TargetRangeState {
  if (state.phase !== "open" || player.result !== null) return state;
  const aim = addSample<[number, number]>(player.aim, ctx.atMs, [
    input.payload.yaw,
    input.payload.pitch,
  ]);
  if (aim === player.aim) return state;
  return updatePlayer(state, player.id, { aim, aiming: true });
}

/**
 * A shot for the current volley, let go at or after it opened. At or before the close the arrow
 * flies, from the aim and power the phone had at release, with the volley's wind. After the close
 * it's `late`. The crosshair hides either way.
 */
function applyShoot(
  state: TargetRangeState,
  player: TargetRangePlayer,
  input: ShootInput,
  ctx: InputContext,
): TargetRangeState {
  if (state.phase !== "open" && state.phase !== "landing") return state;
  if (input.payload.volley !== volleyOf(state) || player.result !== null) return state;
  if (state.openAtMs === null || ctx.atMs < state.openAtMs) return state;

  const hidden = { aiming: false, aim: [] };
  if (state.closeAtMs !== null && ctx.atMs > state.closeAtMs) {
    return updatePlayer(state, player.id, { ...hidden, result: "late" });
  }

  const rules = roundRules(state.round);
  const { aim, power } = input.payload;
  const landing = flyArrow(rules, aim, power, currentWind(state));
  const points = arrowPoints(state.target, rules.radius, landing.x, landing.y);
  const arrow: Arrow = {
    playerId: player.id,
    volley: volleyOf(state),
    atMs: ctx.atMs,
    aim: { yaw: aim.yaw, pitch: aim.pitch },
    power,
    x: landing.x,
    y: landing.y,
    flightMs: landing.flightMs,
    landsAtMs: ctx.atMs + landing.flightMs,
    points,
    landed: false,
  };
  const next = updatePlayer(state, player.id, { ...hidden, result: points });
  return { ...next, arrows: [...state.arrows, arrow] };
}

/** The draw was let go too early or cancelled: the crosshair hides and the player may draw again. */
function applyLower(
  state: TargetRangeState,
  player: TargetRangePlayer,
  input: LowerInput,
): TargetRangeState {
  if (state.phase !== "open" || input.payload.volley !== volleyOf(state)) return state;
  if (player.result !== null || (!player.aiming && player.aim.length === 0)) return state;
  return updatePlayer(state, player.id, { aiming: false, aim: [] });
}

/**
 * `aim`, `shoot` or `lower` (docs/games/target-range.md, "What `onPlayerInput` does"). Anything
 * from a player who left or isn't in the match is ignored. `ctx.displayLagMs` is ignored on
 * purpose: targets don't move, so TV lag never changes a score (spec, "Fairness", rule 3).
 */
export function onPlayerInput(
  state: TargetRangeState,
  player: Player,
  input: TargetRangeInput,
  ctx: InputContext,
): TargetRangeState {
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left) return state;
  switch (input.type) {
    case "aim":
      return applyAim(state, current, input, ctx);
    case "shoot":
      return applyShoot(state, current, input, ctx);
    case "lower":
      return applyLower(state, current, input);
  }
}

/** Opens `arrow` of the round at `state.nowMs`: clears every player's result and crosshair. */
function openVolley(state: TargetRangeState, arrow: number): TargetRangeState {
  return {
    ...state,
    phase: "open",
    arrow,
    phaseAtMs: state.nowMs,
    openAtMs: state.nowMs,
    closeAtMs: null,
    timedOut: false,
    players: state.players.map((player) => ({ ...player, aiming: false, aim: [], result: null })),
  };
}

/**
 * Closes the volley: when everyone shot, at this tick; when the clock ran out, at exactly 10,000 ms
 * after it opened. Crosshairs of players who didn't shoot disappear.
 */
function closeVolley(state: TargetRangeState, timedOut: boolean): TargetRangeState {
  return {
    ...state,
    phase: "landing",
    phaseAtMs: state.nowMs,
    closeAtMs: timedOut ? (state.openAtMs as number) + volleyMs : state.nowMs,
    timedOut,
    players: state.players.map((player) =>
      player.aiming || player.aim.length > 0 ? { ...player, aiming: false, aim: [] } : player,
    ),
  };
}

/** Reveals the volley: players without a shot get `none`, and every result is added to the scores. */
export function revealVolley(state: TargetRangeState): TargetRangeState {
  return {
    ...state,
    phase: "reveal",
    phaseAtMs: state.nowMs,
    players: state.players.map((player) => {
      const result = player.result ?? "none";
      const points = typeof result === "number" ? result : 0;
      return {
        ...player,
        result,
        last: result,
        points: player.points + points,
        tens: player.tens + (points === bullseyePoints ? 1 : 0),
      };
    }),
  };
}

/** Moves the match along at the fixed 60 Hz step. Time only comes from `dtMs`. */
export function onTick(state: TargetRangeState, dtMs: number): TargetRangeState {
  if (state.phase === "over") return state;
  const nowMs = state.nowMs + dtMs;
  // Due times sit on the tick grid. Half a tick of slack absorbs float rounding in the sums.
  const reached = (dueMs: number): boolean => nowMs >= dueMs - dtMs / 2;
  const landing = state.arrows.some((arrow) => !arrow.landed && reached(arrow.landsAtMs));
  const next: TargetRangeState = {
    ...state,
    nowMs,
    arrows: landing
      ? state.arrows.map((arrow) =>
          !arrow.landed && reached(arrow.landsAtMs) ? { ...arrow, landed: true } : arrow,
        )
      : state.arrows,
  };

  switch (state.phase) {
    case "intro":
      return reached(state.phaseAtMs + introMs) ? openVolley(next, 1) : next;
    case "open": {
      const everyoneShot = activePlayers(state).every((player) => player.result !== null);
      if (everyoneShot) return closeVolley(next, false);
      return reached((state.openAtMs as number) + volleyMs) ? closeVolley(next, true) : next;
    }
    case "landing": {
      const allLanded = next.arrows.every((arrow) => arrow.landed);
      const waited = !state.timedOut || reached((state.closeAtMs as number) + lateWaitMs);
      return allLanded && waited ? revealVolley(next) : next;
    }
    case "reveal":
      if (!reached(state.phaseAtMs + revealMs)) return next;
      return state.arrow < arrowsPerRound
        ? openVolley(next, state.arrow + 1)
        : { ...next, phase: "roundEnd", phaseAtMs: nowMs };
    case "roundEnd":
      if (!reached(state.phaseAtMs + roundEndMs)) return next;
      return state.round < roundCount
        ? startRound(next, state.round + 1)
        : { ...next, phase: "over", phaseAtMs: nowMs };
  }
}

/**
 * A seat expired. The player keeps their points and shoots no more arrows; an arrow already shot
 * still counts. Volleys stop waiting for them. With no seated players left the match ends at once.
 */
export function onPlayerLeft(state: TargetRangeState, player: Player): TargetRangeState {
  if (state.phase === "over") return state;
  const current = findPlayer(state, player.id);
  if (current === undefined || current.left) return state;
  const next = updatePlayer(state, player.id, { left: true, aiming: false, aim: [] });
  return activePlayers(next).length === 0
    ? { ...next, phase: "over", phaseAtMs: state.nowMs }
    : next;
}
