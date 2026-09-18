/**
 * What the phone shows right now (docs/games/strike-night.md, "Screens"). Pure and framework-free,
 * so every controller state is a plain data assertion, the same split Quick Draw and Target
 * Range's `present.ts` use.
 *
 * The host sends `sn-watch`, `sn-next`, `sn-bowl` and `sn-result`. `sn-bowl` gets three local
 * phases on top, none of which need a round trip: `gripping` the instant a finger lands, `noSwing`
 * when it lifts too weak, and `away` the instant `bowl` fires.
 */
import type { BigActionState } from "@couchcade/ui";
import type { CueToken } from "@couchcade/protocol";
import type { RollResult } from "../shared/state.ts";
import type { StrikeNightScreen, StrikeNightView } from "../shared/view.ts";

/**
 * The phone's own part of a bowl. `ready`: nothing happened yet, or a previous swing was too
 * weak. `gripping`: a finger is on the big action. `noSwing`: the last release didn't swing
 * enough to bowl. `away`: the ball is gone, until the next `sn-bowl`.
 */
export type BowlPhase = "ready" | "gripping" | "noSwing" | "away";

export interface LocalState {
  /** Motion swings with the phone, touch swipes the big action. */
  mode: "motion" | "touch";
  /** False until the room clock has synced. The grip stays off until then. */
  synced: boolean;
  phase: BowlPhase;
}

export interface StrikeNightPresentation {
  /** The big action's fill and interactivity. */
  state: BigActionState;
  /** Under 40 characters. */
  actionLabel: string;
  /** The line above the big action. Under 40 characters. */
  statusLine: string;
  /** The line below the big action. Under 40 characters. */
  hint: string;
  /** True when the move bar shows and can be dragged. */
  bar: boolean;
  /** True when a `pointerdown` on the big action starts a grip. */
  canGrip: boolean;
  /** A one-shot haptic to play the moment this presentation first appears. */
  cue?: CueToken;
}

const watchTv = "Watch the TV";
const dragBar = "Drag the bar to move";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function bowlStatus(data: StrikeNightView): string {
  if (data.roll === 1) return `Frame ${data.frame} of ${data.frames} · your turn`;
  return `${plural(data.standing, "pin")} left`;
}

function watchScreen(screen: StrikeNightScreen, data: StrikeNightView): StrikeNightPresentation {
  if (screen === "sn-next") {
    return {
      state: "waiting",
      actionLabel: watchTv,
      statusLine: "You're up next",
      hint: "Get ready to bowl",
      bar: false,
      canGrip: false,
    };
  }
  return {
    state: "waiting",
    actionLabel: watchTv,
    statusLine: data.bowler === null ? watchTv : `${data.bowler} is bowling`,
    hint: `Frame ${data.frame} of ${data.frames} · you have ${data.total}`,
    bar: false,
    canGrip: false,
  };
}

function resultLine(last: RollResult): string {
  if (last.auto) return "Time's up, we rolled for you";
  if (last.mark === "strike") return "Strike!";
  if (last.mark === "spare") return "Spare!";
  if (last.mark === "gutter") return "Gutter ball";
  return plural(last.pins, "pin");
}

function resultScreen(data: StrikeNightView): StrikeNightPresentation {
  const last = data.last;
  const base = {
    state: "waiting" as const,
    actionLabel: watchTv,
    bar: false,
    canGrip: false,
  };
  if (last === null) return { ...base, statusLine: watchTv, hint: "Roll again soon" };
  return {
    ...base,
    statusLine: resultLine(last),
    hint: last.frame === null ? "Roll again soon" : `Frame ${last.frame} · total ${data.total}`,
    ...(last.mark === "strike" ? { cue: "celebrate" as const } : {}),
  };
}

function bowlScreen(data: StrikeNightView, local: LocalState): StrikeNightPresentation {
  if (!local.synced) {
    return {
      state: "disabled",
      actionLabel: "Wait…",
      statusLine: bowlStatus(data),
      hint: watchTv,
      bar: false,
      canGrip: false,
    };
  }
  const touch = local.mode === "touch";
  // The base label pairs the same way in every ungripped state: "Hold the ball" for motion,
  // "Swipe up to bowl" for touch, as docs/games/strike-night.md's `sn-bowl` roll 1 row sets it.
  const readyLabel = touch ? "Swipe up to bowl" : "Hold the ball";
  switch (local.phase) {
    case "gripping":
      // No `cue` here: Controller.vue plays "press" itself, the instant the finger lands
      // (`onPress`), same as the "ball away" phase plays it itself at release.
      return {
        state: "hold",
        actionLabel: touch ? "Swipe up" : "Swing, then let go",
        statusLine: "Swing your arm",
        hint: "Twist to hook",
        bar: false,
        canGrip: false,
      };
    case "noSwing":
      return {
        state: "hold",
        actionLabel: readyLabel,
        statusLine: touch ? "Swipe further up" : "Swing before you let go",
        hint: dragBar,
        bar: true,
        canGrip: true,
      };
    case "away":
      return {
        state: "disabled",
        actionLabel: "—",
        statusLine: "Ball away!",
        hint: watchTv,
        bar: false,
        canGrip: false,
      };
    case "ready":
      return {
        state: "hold",
        actionLabel: readyLabel,
        statusLine: bowlStatus(data),
        hint: data.first ? "Room to swing? Go for it" : dragBar,
        bar: true,
        canGrip: true,
        ...(data.roll === 1 ? { cue: "your-turn" as const } : {}),
      };
  }
}

/** Maps the host's view plus this phone's local state to the screen. */
export function present(
  screen: StrikeNightScreen,
  data: StrikeNightView,
  local: LocalState,
): StrikeNightPresentation {
  if (screen === "sn-result") return resultScreen(data);
  if (screen === "sn-watch" || screen === "sn-next") return watchScreen(screen, data);
  return bowlScreen(data, local);
}
