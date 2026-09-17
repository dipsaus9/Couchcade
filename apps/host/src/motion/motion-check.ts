import type { ClockScheduler } from "@couchcade/game-sdk/clock";
import type { CouchcadeGame } from "@couchcade/game-sdk/contract";
import type { ControllerView, PayloadOf, PlayerInfo } from "@couchcade/protocol";
import { seatedPlayers, type LobbyState } from "../screens/lobby/lobby-state.ts";

// The motion step on the TV (docs/architecture/motion.md, "Permission, calibration and resume
// flow", rules 1 to 4; session-flow.md, the `motion-check` phase). Before a game with
// `needsMotion`, every seated phone shows the motion permission screen and answers once with
// `motion:status`. The host starts the game when every seated phone has answered, or after 20
// seconds, so one phone left on a table can't hold up the room. Phones that said no, have no
// sensors or never answered play with touch, and the TV marks them with the touch icon.

/** How long the host waits for every phone before it starts anyway (motion.md flow rule 4). */
export const motionWaitMs = 20_000;

export type MotionStatus = PayloadOf<"motion:status">["status"];

/** What the TV shows next to a player during the step. */
export type MotionPlayerState = "waiting" | "motion" | "touch";

/**
 * The `motion-permission` view every seated phone gets. The phone has no game code, so the view
 * carries the title. `step` counts motion steps this night, so "Play again" asks again.
 */
export type MotionPermissionView = {
  gameId: string;
  title: string;
  step: number;
};

/** One seated player and their answer so far. */
export interface MotionCheckPlayer {
  player: PlayerInfo;
  state: MotionPlayerState;
}

/** True for an answer that means the player plays with touch. */
export function isTouch(status: MotionStatus): boolean {
  return status !== "granted";
}

export interface MotionCheckOptions {
  game: CouchcadeGame;
  /** Counts motion steps this night. */
  step: number;
  /** The latest lobby state: who is seated. */
  lobby(): LobbyState | null;
  schedule: ClockScheduler;
  /**
   * Every seated phone answered, or the 20 seconds ran out. `touch` holds the seated players who
   * play with touch, unanswered ones included.
   */
  onDone(touch: ReadonlySet<string>): void;
  /** An answer came in, so the TV redraws. */
  onChange(): void;
}

export interface MotionCheck {
  readonly game: CouchcadeGame;
  /** Every seated player with their state, in join order. */
  players(): MotionCheckPlayer[];
  /** A `motion:status` from a phone. Only seated players count. The latest answer wins. */
  answer(from: string, status: MotionStatus): void;
  /** Presence changed: a player who left no longer holds the step up. */
  refresh(): void;
  /** What each seated phone shows, by player id. */
  views(): Map<string, ControllerView>;
  /** Cancels the 20 second timer. */
  dispose(): void;
}

/** Runs one motion step. It owns one timer and no socket. */
export function createMotionCheck(options: MotionCheckOptions): MotionCheck {
  const answers = new Map<string, MotionStatus>();
  let done = false;
  let cancelTimer: (() => void) | null = options.schedule(() => {
    cancelTimer = null;
    finish();
  }, motionWaitMs);

  const seated = (): PlayerInfo[] => {
    const lobby = options.lobby();
    return lobby === null ? [] : seatedPlayers(lobby);
  };

  function stateOf(id: string): MotionPlayerState {
    const status = answers.get(id);
    if (status === undefined) return "waiting";
    return isTouch(status) ? "touch" : "motion";
  }

  function finish(): void {
    if (done) return;
    done = true;
    cancelTimer?.();
    cancelTimer = null;
    const touch = new Set<string>();
    for (const player of seated()) {
      if (stateOf(player.id) !== "motion") touch.add(player.id);
    }
    options.onDone(touch);
  }

  function finishWhenEveryoneAnswered(): boolean {
    const players = seated();
    if (players.length === 0 || players.some((player) => !answers.has(player.id))) return false;
    finish();
    return true;
  }

  return {
    game: options.game,

    players: () => seated().map((player) => ({ player, state: stateOf(player.id) })),

    answer(from, status) {
      if (done || !seated().some((player) => player.id === from)) return;
      const changed = answers.get(from) !== status;
      answers.set(from, status);
      if (finishWhenEveryoneAnswered()) return;
      if (changed) options.onChange();
    },

    refresh() {
      if (!done) finishWhenEveryoneAnswered();
    },

    views() {
      const data: MotionPermissionView = {
        gameId: options.game.id,
        title: options.game.title,
        step: options.step,
      };
      const view: ControllerView = { screen: "motion-permission", data };
      return new Map(seated().map((player) => [player.id, view]));
    },

    dispose() {
      done = true;
      cancelTimer?.();
      cancelTimer = null;
    },
  };
}
