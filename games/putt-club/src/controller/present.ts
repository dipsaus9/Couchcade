/**
 * What the phone shows right now (docs/games/putt-club.md, "Phone controller", "Screens"). Pure
 * and framework-free, so every controller state is a plain data assertion, the same split every
 * shipped game's `present.ts` uses.
 *
 * The host sends `pc-watch`, `pc-next`, `pc-putt`, `pc-result` and `pc-end`. The phone adds its own
 * local states on top of `pc-putt`: locked, unlocked-too-early and putt-away. They change the
 * instant a finger moves, before any round trip, exactly as Target Range's drawing and Bandeja's
 * swung flash do.
 *
 * `apps/controller/src/runtime/controller.ts` doesn't forward the host's own computed `cue` to a
 * game's controller component today (only `screen`/`data`/`player`/`send`/`input`/`motion` reach
 * it) -- every shipped game's `present.ts` re-derives an equivalent cue locally from `data`, and
 * this one follows the same precedent. `pc-end`'s "celebrate on a win" (docs/games/putt-club.md)
 * can't be reproduced this way: `PuttClubView` carries this player's own total and par, never the
 * other players' placements, so there is nothing here to tell a win from a loss. `pc-end` is shown
 * without a cue; wiring the host's placement into the view (or forwarding its `cue`) is a gap for a
 * follow-up story, not something this one can fix without touching `shared/` or the platform
 * runtime.
 */
import type { BigActionState } from "@couchcade/ui";
import type { CueToken } from "@couchcade/protocol";
import type { PuttPhase } from "./putt.ts";
import type { PuttClubScreen, PuttClubView } from "../shared/view.ts";

export interface LocalState {
  /** Motion aims and swings with the phone, touch drags the pad and swipes the big action. */
  mode: "motion" | "touch";
  /** False until the room clock has synced. The big action stays off until then. */
  synced: boolean;
  /** This phone's own part of the current turn (see module doc). Ignored outside `pc-putt`. */
  phase: PuttPhase;
}

export interface PuttClubPresentation {
  /** The big action's fill and interactivity. */
  state: BigActionState;
  /** Under 40 characters. */
  actionLabel: string;
  /** The line above the big action. Under 40 characters. */
  statusLine: string;
  /** The line below the big action. Under 40 characters. */
  hint: string;
  /** True when the aim pad and its Centre button show: touch mode, on `pc-putt`, while aiming. */
  pad: boolean;
  /** A one-shot haptic to play the moment this presentation first appears. */
  cue?: CueToken;
}

const watchTv = "Watch the TV";
const pointAtTv = "Point at the TV to aim";
const dragPad = "Drag the pad to aim";

/** "+4", "-2" or "E" (even), the way players talk about a round against par. */
function toParText(toPar: number): string {
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function watchHint(data: PuttClubView): string {
  return `Hole ${data.hole} of ${data.holes} · you're ${toParText(data.toPar)}`;
}

const base = { pad: false };

function watchScreen(data: PuttClubView): PuttClubPresentation {
  return {
    ...base,
    state: "waiting",
    actionLabel: watchTv,
    statusLine: `${data.putter ?? ""} is putting`,
    hint: watchHint(data),
  };
}

function nextScreen(): PuttClubPresentation {
  return {
    ...base,
    state: "waiting",
    actionLabel: watchTv,
    statusLine: "You're up next",
    hint: "Line it up on the TV",
  };
}

/** The steady `pc-putt` status line: not yet locked, not yet swung. */
function readyStatus(data: PuttClubView): string {
  return `Hole ${data.hole} · par ${data.par} · ${data.first ? "your turn" : `stroke ${data.stroke}`}`;
}

function readyHint(data: PuttClubView, touch: boolean): string {
  if (touch) return dragPad;
  return data.first ? "Room to swing? Go for it" : pointAtTv;
}

function puttScreen(data: PuttClubView, local: LocalState): PuttClubPresentation {
  if (!local.synced) {
    return {
      ...base,
      state: "disabled",
      actionLabel: "Wait…",
      statusLine: readyStatus(data),
      hint: watchTv,
    };
  }
  const touch = local.mode === "touch";
  switch (local.phase) {
    case "away":
      return {
        ...base,
        state: "disabled",
        actionLabel: "—",
        statusLine: "Putt away!",
        hint: watchTv,
      };
    case "locked":
      return {
        pad: false,
        state: "hold",
        actionLabel: touch ? "Swipe up to putt" : "Swing to putt",
        statusLine: "Line locked",
        hint: "Gently does it",
        cue: "press",
      };
    case "unlockedEarly":
      return {
        pad: touch,
        state: "hold",
        actionLabel: "Hold to lock the line",
        statusLine: touch ? "Swipe further up" : "Swing before you let go",
        hint: touch ? dragPad : pointAtTv,
      };
    case "aiming":
      return {
        pad: touch,
        state: "hold",
        actionLabel: "Hold to lock the line",
        statusLine: readyStatus(data),
        hint: readyHint(data, touch),
        ...(data.first ? { cue: "your-turn" as const } : {}),
      };
  }
}

/** The strokes still allowed on this hole before the cap picks the player up. */
function puttsToGo(strokes: number, cap: number): string {
  const left = Math.max(0, cap - strokes);
  return `${left} putt${left === 1 ? "" : "s"} to go`;
}

function resultStatus(data: PuttClubView): string {
  const last = data.last;
  if (last === null) return "";
  if (last.result === "holed") return "In the hole!";
  // The view carries only "penalty", never which hazard caused it (a pond or a pit): CC-13.2's
  // `LastStroke` doesn't distinguish them, so a specific "In the water" line isn't derivable here.
  if (last.result === "penalty") return "Penalty · +1";
  if (last.result === "capped") return `Picked up at ${data.cap}`;
  return last.auto ? "Time's up, we putted for you" : puttsToGo(last.strokes, data.cap);
}

function resultHint(data: PuttClubView): string {
  const holeScore = data.last?.hole;
  if (holeScore !== null && holeScore !== undefined) {
    return `Hole ${data.hole}: ${holeScore} · you're ${toParText(data.toPar)}`;
  }
  return watchHint(data);
}

/** A hole-out at or under par celebrates (docs/games/putt-club.md, "Screens"). */
function resultCelebrates(data: PuttClubView): boolean {
  const holeScore = data.last?.hole;
  return holeScore !== null && holeScore !== undefined && holeScore <= data.par;
}

function resultScreen(data: PuttClubView): PuttClubPresentation {
  return {
    ...base,
    state: "waiting",
    actionLabel: watchTv,
    statusLine: resultStatus(data),
    hint: resultHint(data),
    ...(resultCelebrates(data) ? { cue: "celebrate" as const } : {}),
  };
}

function endScreen(data: PuttClubView): PuttClubPresentation {
  return {
    ...base,
    state: "waiting",
    actionLabel: watchTv,
    statusLine: `You finished ${toParText(data.toPar)}`,
    hint: "Nice round",
  };
}

/** Maps the host's view plus this phone's local state to the screen. */
export function present(
  screen: PuttClubScreen,
  data: PuttClubView,
  local: LocalState,
): PuttClubPresentation {
  switch (screen) {
    case "pc-watch":
      return watchScreen(data);
    case "pc-next":
      return nextScreen();
    case "pc-putt":
      return puttScreen(data, local);
    case "pc-result":
      return resultScreen(data);
    case "pc-end":
      return endScreen(data);
  }
}
