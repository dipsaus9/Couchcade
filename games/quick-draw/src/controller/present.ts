/**
 * What the phone shows right now (docs/games/quick-draw.md, "Phone controller"). Pure and
 * framework-free, so every controller state is a plain data assertion in
 * test/controller/present.test.ts, with no component to mount.
 *
 * `synced` gates `qd-standoff`: before the room clock has synced, a tap's `at` can't be trusted
 * yet, so the phone stays on `qd-watch` until it has (docs/games/quick-draw.md, "Edge cases": "Phone
 * not clock-synced yet (just reconnected)"). `tapped` is local, not the host's: the phone disables
 * itself the instant a finger lands, before any round-trip, so a second tap can never be sent.
 */
import type { BigActionState } from "@couchcade/ui";
import type { CueToken } from "@couchcade/protocol";
import type {
  PracticeView,
  QuickDrawResultView,
  QuickDrawScreen,
  QuickDrawView,
} from "../shared/view.ts";

export interface QuickDrawPresentation {
  /** The big action's fill and interactivity. */
  state: BigActionState;
  /** The big action's label. Under 40 characters. */
  actionLabel: string;
  /** The line above the big action. Under 40 characters. */
  statusLine: string;
  /** The line below the big action. Under 40 characters. */
  hint: string;
  /** A one-shot local haptic to play the moment this presentation first appears. */
  cue?: CueToken;
}

function isResultView(data: QuickDrawView): data is QuickDrawResultView {
  return "result" in data;
}

const roundStatus = (data: QuickDrawView): string =>
  `Round ${data.round} · first to ${data.target}`;

/** `243` becomes `"0.243"`. Reaction times are always under a few seconds, so 3 decimals fit. */
const secondsOf = (ms: number): string => (ms / 1000).toFixed(3);

const pointsOf = (points: number): string => `${points} ${points === 1 ? "point" : "points"}`;

/**
 * Solo practice (docs/games/quick-draw.md, "Solo practice"): a valid time says whether it's a new
 * best, and the match's last result shows the best and average times instead of the usual hint.
 */
function practicePresentation(
  data: QuickDrawResultView,
  practice: PracticeView,
): Pick<QuickDrawPresentation, "statusLine" | "hint" | "cue"> {
  const lines =
    data.result === "won"
      ? {
          statusLine: practice.newBest
            ? "New best!"
            : `Your best is ${secondsOf(practice.bestMs ?? 0)} s`,
          hint: `${secondsOf(data.ms ?? 0)} s · ${pointsOf(data.points)}`,
          cue: "celebrate" as const,
        }
      : roundLines(data);
  if (!practice.final || practice.bestMs === null || practice.averageMs === null) return lines;
  return {
    ...lines,
    hint: `Best ${secondsOf(practice.bestMs)} s · average ${secondsOf(practice.averageMs)} s`,
  };
}

function resultPresentation(
  data: QuickDrawResultView,
): Pick<QuickDrawPresentation, "statusLine" | "hint" | "cue"> {
  return data.practice ? practicePresentation(data, data.practice) : roundLines(data);
}

/** A result with other players in the match (docs/games/quick-draw.md, "Phone controller"). */
function roundLines(
  data: QuickDrawResultView,
): Pick<QuickDrawPresentation, "statusLine" | "hint" | "cue"> {
  switch (data.result) {
    case "won":
      return {
        statusLine: "You won the round!",
        hint: `${secondsOf(data.ms ?? 0)} s · ${pointsOf(data.points)}`,
        cue: "celebrate",
      };
    case "lost":
      return {
        statusLine: `${data.winner ?? "Someone"} was faster`,
        hint: `Your time ${secondsOf(data.ms ?? 0)} s`,
      };
    case "foul":
      return {
        statusLine: "Too early, that's a foul",
        hint: "Wait for DRAW next time",
        cue: "foul",
      };
    case "fooled":
      return {
        statusLine: "That was a fake, that's a foul",
        hint: "Only DRAW counts",
        cue: "foul",
      };
    case "slow":
      return { statusLine: "Too slow this time", hint: "Tap as soon as you see DRAW" };
  }
}

/**
 * Maps the host's view plus this phone's own local state to what the big action shows
 * (docs/games/quick-draw.md, "Phone controller" table). `cue` is derived locally, never sent by
 * the host (`ControllerProps` carries only `screen`, `data`, `player` and `send`): round 1's
 * `qd-standoff` is always `your-turn`, `won` is always `celebrate`, `foul`/`fooled` are always
 * `foul`, so no extra plumbing is needed to know which to play.
 */
export function present(
  screen: QuickDrawScreen,
  data: QuickDrawView,
  synced: boolean,
  tapped: boolean,
): QuickDrawPresentation {
  const effective: QuickDrawScreen = screen === "qd-standoff" && !synced ? "qd-watch" : screen;

  if (effective === "qd-standoff") {
    if (tapped) {
      return { state: "disabled", actionLabel: "—", statusLine: "Tapped!", hint: "Watch the TV" };
    }
    return {
      state: "dont-tap",
      actionLabel: "Wait for DRAW",
      statusLine: roundStatus(data),
      hint: "Tap anywhere at DRAW",
      ...(data.round === 1 ? { cue: "your-turn" as const } : {}),
    };
  }

  if (effective === "qd-result" && isResultView(data)) {
    return { state: "waiting", actionLabel: "Watch the TV", ...resultPresentation(data) };
  }

  // qd-watch: round 1's intro (or any round before the clock has synced).
  return {
    state: "waiting",
    actionLabel: "Watch the TV",
    statusLine: roundStatus(data),
    hint: "Tap when the TV shouts DRAW",
  };
}
