/**
 * What the phone shows right now (docs/games/bandeja.md, "Screens"). Pure and framework-free, so
 * every controller state is a plain data assertion, the same split every shipped game's
 * `present.ts` uses.
 *
 * The host sends one view at the start of the match, once per point boundary (with the new score
 * and the last point's result) and once at match end -- "during a rally the phone shows nothing
 * new at all" (docs/games/bandeja.md, "Screens"). `justEnded` is local state Controller.vue owns:
 * the moment a new `point` arrives, this phone shows the last point's outcome ("Point! 4 – 2",
 * "Net · 3 – 3" or "Their point · 3 – 3") for the same window the TV's own `pointEnd` phase runs
 * (docs/games/bandeja.md, "Point flow and timings"), then settles to the steady score line for the
 * rest of that rally, since no further push is coming until the point after.
 */
import type { BigActionState } from "@couchcade/ui";
import type { CueToken } from "@couchcade/protocol";
import type { BandejaScreen, BandejaView } from "../shared/view.ts";

export interface LocalState {
  /** Motion swings with the phone, touch taps the pad. */
  mode: "motion" | "touch";
  /** False until the room clock has synced. The controls stay off until then. */
  synced: boolean;
  /** True for the settle window after a fresh point arrives (see module doc). */
  justEnded: boolean;
}

export interface BandejaPresentation {
  /** The big action's fill and interactivity. */
  state: BigActionState;
  /** Under 40 characters. */
  actionLabel: string;
  /** The line above the big action. Under 40 characters. */
  statusLine: string;
  /** The line below the big action. Under 40 characters. */
  hint: string;
  /** A one-shot haptic to play the moment this presentation first appears. */
  cue?: CueToken;
}

const watchTv = "Watch the TV";
const watchRing = "Watch the ring on the TV";

const scoreLine = (data: BandejaView): string => `${data.scores[0]} – ${data.scores[1]}`;

/** The steady line shown for the rest of a rally, once the last point's news has settled. */
function steadyStatus(data: BandejaView): string {
  return data.serving ? `${scoreLine(data)} · your serve` : scoreLine(data);
}

/** The line for a fresh point boundary: the very first point, or the last point's outcome. */
function freshStatus(data: BandejaView): { statusLine: string; cue?: CueToken } {
  const last = data.last;
  if (last === null) return { statusLine: `Bandeja · first to ${data.target}`, cue: "your-turn" };
  if (last.won) return { statusLine: `Point! ${scoreLine(data)}`, cue: "celebrate" };
  if (last.reason === "net") return { statusLine: `Net · ${scoreLine(data)}` };
  return { statusLine: `Their point · ${scoreLine(data)}` };
}

function playScreen(data: BandejaView, local: LocalState): BandejaPresentation {
  const touch = local.mode === "touch";
  const actionLabel = touch ? "Tap left or right" : "Swing your arm";
  if (!local.synced) {
    return {
      state: "disabled",
      actionLabel: "Wait…",
      statusLine: steadyStatus(data),
      hint: watchTv,
    };
  }
  const firstPoint = data.last === null;
  const { statusLine, cue } =
    local.justEnded || firstPoint ? freshStatus(data) : { statusLine: steadyStatus(data) };
  // The "room to swing" safety hint is motion-only (motion.md, "Safety"): touch has nothing to
  // swing, so its hint stays the same "tap as the ring closes" reminder throughout.
  const hint = touch
    ? "Tap as the ring closes"
    : firstPoint
      ? "Room to swing? Go for it"
      : watchRing;
  return {
    state: touch ? "hold" : "disabled",
    actionLabel,
    statusLine,
    hint,
    ...(cue === undefined ? {} : { cue }),
  };
}

/** Winner's score first, loser's second, in both "You won" and "They won" (docs/games/bandeja.md,
 * "Screens": the two examples share the same two numbers). */
function endScreen(data: BandejaView): BandejaPresentation {
  const mine = data.side === "a" ? data.scores[0] : data.scores[1];
  const theirs = data.side === "a" ? data.scores[1] : data.scores[0];
  const won = mine > theirs;
  const [first, second] = won ? [mine, theirs] : [theirs, mine];
  return {
    state: "waiting",
    actionLabel: watchTv,
    statusLine: won ? `You won ${first} – ${second}` : `They won ${first} – ${second}`,
    hint: "Nice rallies",
    ...(won ? { cue: "celebrate" as const } : {}),
  };
}

/** Maps the host's view plus this phone's local state to the screen (docs/games/bandeja.md,
 * "Screens" table). The "swung" row's flash is Controller.vue's own overlay on top of this. */
export function present(
  screen: BandejaScreen,
  data: BandejaView,
  local: LocalState,
): BandejaPresentation {
  return screen === "bj-end" ? endScreen(data) : playScreen(data, local);
}
