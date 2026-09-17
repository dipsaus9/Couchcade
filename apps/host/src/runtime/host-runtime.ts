import {
  getDisplayLagMs,
  readDisplayLag,
  roomClock,
  saveDisplayLag,
} from "@couchcade/game-sdk/clock";
import type { RoomClock, StoredDisplayLag } from "@couchcade/game-sdk/clock";
import type { CouchcadeGame, Outcome } from "@couchcade/game-sdk/contract";
import type { GameRegistry } from "@couchcade/game-sdk/registry";
import type { ControllerView, HostToRelayMessage, RelayToHostMessage } from "@couchcade/protocol";
import { createMotionCheck, isTouch } from "../motion/motion-check.ts";
import type { MotionCheck, MotionCheckPlayer } from "../motion/motion-check.ts";
import { createCalibration } from "../screens/calibration/calibration.ts";
import type {
  Calibration,
  CalibrationStatus,
  FlashFrame,
  Measurement,
} from "../screens/calibration/calibration.ts";
import type { LobbyState } from "../screens/lobby/lobby-state.ts";
import { seatedPlayers, vip } from "../screens/lobby/lobby-state.ts";
import { joinUrl } from "../screens/lobby/join-url.ts";
import { createGameMenu, fits } from "../screens/menu/menu.ts";
import type { Countdown, GameMenu, MenuGame } from "../screens/menu/menu.ts";
import { createGameResults } from "../screens/results/results.ts";
import type { GameResults, ResultsStanding } from "../screens/results/results.ts";
import { createFixedStepLoop } from "./fixed-step.ts";
import type { FixedStepLoop } from "./fixed-step.ts";
import { createGameRunner } from "./game-runner.ts";
import type { GameRunner } from "./game-runner.ts";
import type { GameStage } from "./stage.ts";
import { devWarn, localNow, scheduleTimeout } from "./timing.ts";
import type { Scheduler } from "./timing.ts";
import { createViewSync } from "./view-sync.ts";

export interface HostRuntimeOptions {
  registry: GameRegistry;
  send(message: HostToRelayMessage): void;
  stage: GameStage;
  /** Called when the phase, the menu or the running game changes, so the TV can redraw. */
  onChange?(): void;
  /** Defaults to the shared `roomClock`. */
  clock?: RoomClock;
  /** Local clock in milliseconds, on the room clock's local timeline. */
  now?: () => number;
  schedule?: Scheduler;
  /** A fresh game seed. Defaults to 32 random bits from `crypto`. */
  createSeed?: () => number;
  /** A number in [0, 1) for "Surprise me". Defaults to `Math.random`. */
  random?: () => number;
  reducedMotion?: () => boolean;
  warn?: (message: string) => void;
  /** Where the calibrated TV lag lives. Defaults to the host's `localStorage`, through the SDK. */
  displayLag?: DisplayLagStore;
  /**
   * The site origin phones join on, for the join URL games show next to the room code. Defaults to
   * `location.origin`.
   */
  origin?: string;
}

/** Reads and stores the calibrated TV lag (session-flow.md, "Storage and use"). */
export interface DisplayLagStore {
  /** The lag games get, 0 when the TV was never calibrated. */
  ms(): number;
  /** The stored measurement, or null. */
  read(): StoredDisplayLag | null;
  save(ms: number): void;
}

export const localDisplayLag: DisplayLagStore = {
  ms: () => getDisplayLagMs(),
  read: () => readDisplayLag(),
  save: (ms) => {
    saveDisplayLag(ms, Date.now());
  },
};

export interface RunningGame {
  readonly game: CouchcadeGame;
  readonly runner: GameRunner;
  /**
   * In-game players who play with touch: they said no, have no sensors or never answered the
   * motion step, or their sensors stopped during the game. Always empty for a game without
   * `needsMotion`.
   */
  readonly touchPlayers: ReadonlySet<string>;
}

/** The phases this runtime drives today. */
export type HostPhase = "lobby" | "menu" | "calibration" | "motion-check" | "playing" | "results";

/** What the TV motion step draws. */
export interface MotionScreenState {
  game: CouchcadeGame;
  players: MotionCheckPlayer[];
}

/** What the TV lag calibration screen draws. */
export interface CalibrationScreenState {
  status: CalibrationStatus;
  /** Room time of the first flash. */
  startsAt: number;
  measurement: Measurement;
}

/** What the TV menu draws. */
export interface MenuScreenState {
  games: MenuGame[];
  countdown: Countdown | null;
}

/** What the TV results screen draws. */
export interface ResultsScreenState {
  game: CouchcadeGame;
  standings: ResultsStanding[];
  podium: ResultsStanding[];
  headline: string;
  canPlayAgain: boolean;
  hint: string | null;
}

export interface HostRuntime {
  readonly phase: HostPhase;
  /** The running game, or null outside a game. */
  readonly running: RunningGame | null;
  /** The menu's games and countdown while the phase is `menu`, else null. */
  readonly menu: MenuScreenState | null;
  /** The last game's standings while the phase is `results`, else null. */
  readonly results: ResultsScreenState | null;
  /** The TV lag check while the phase is `calibration`, else null. */
  readonly calibration: CalibrationScreenState | null;
  /** The motion step while the phase is `motion-check`, else null. */
  readonly motion: MotionScreenState | null;
  /** The stored TV lag for the lobby's "Check TV lag" button, or null when never measured. */
  readonly displayLag: StoredDisplayLag | null;
  /** "Check TV lag" on the TV lobby starts the calibration. Does nothing outside the lobby. */
  checkTvLag(): void;
  /** "Skip" on the TV: back to the lobby, the stored value unchanged. */
  skipCalibration(): void;
  /** "Try again" on the TV after nobody got enough taps in. */
  retryCalibration(): void;
  /**
   * Called on every animation frame of the calibration screen with that frame's room time.
   * Returns what to draw, and records the frame that first draws each flash.
   */
  calibrationFrame(roomTime: number): FlashFrame | null;
  /** Feeds one relay message, with the lobby state after that message was applied. */
  handle(message: RelayToHostMessage, lobby: LobbyState): void;
  /** Tells the runtime the socket closed; it reconnects and gets a new `room:welcome`. */
  disconnected(): void;
  /** Stops everything: game loop, scene, countdown, clock sync and pending sends. */
  dispose(): void;
}

/**
 * Runs the night on the TV (docs/architecture/session-flow.md, "The night, phase by phase", and
 * platform.md, "How the host runs a game"): the VIP opens the game menu from the lobby, picks a
 * game, a 3 second countdown starts it, the game ticks at a fixed 60 Hz, views go to phones
 * through the view sync, and when the game has an outcome, the results screen shows one game's
 * placements until the VIP picks "Play again" (restarts the same game) or "Back to menu".
 *
 * From the lobby, "Check TV lag" on the laptop runs the TV lag calibration: the phones tap along
 * with a flash, the median offset is stored, and the lobby comes back. It is never forced before a
 * game. Skipping keeps the old value. Games get the stored value as `displayLagMs`.
 *
 * A game with `needsMotion` runs the motion step first (motion.md, "Permission, calibration and
 * resume flow"): every seated phone shows the motion permission screen, and the game starts once
 * every seated phone sent `motion:status`, or after 20 seconds.
 */
export function createHostRuntime(options: HostRuntimeOptions): HostRuntime {
  const clock = options.clock ?? roomClock;
  const now = options.now ?? localNow;
  const schedule = options.schedule ?? scheduleTimeout;
  const warn = options.warn ?? devWarn;
  const createSeed = options.createSeed ?? (() => crypto.getRandomValues(new Uint32Array(1))[0]!);
  const reducedMotion = options.reducedMotion ?? (() => false);
  const displayLag = options.displayLag ?? localDisplayLag;
  const origin: string | undefined =
    options.origin ?? (typeof location === "undefined" ? undefined : location.origin);

  const views = createViewSync({ send: options.send, now, schedule, warn });
  let lobby: LobbyState | null = null;
  let running: (RunningGame & { loop: FixedStepLoop; touchPlayers: Set<string> }) | null = null;
  let results: GameResults | null = null;
  let calibration: Calibration | null = null;
  let motionCheck: MotionCheck | null = null;
  /** Counts motion steps, so a phone asks again for "Play again". */
  let motionSteps = 0;
  /** The phase last sent to the relay with `room:phase`. */
  let phase: HostPhase = "lobby";

  const menu: GameMenu = createGameMenu({
    registry: options.registry,
    lobby: () => lobby,
    roomNow: () => clock.toHostTime(now()),
    schedule,
    random: options.random,
    onStart: (game) => {
      if (lobby !== null && running === null) begin(game);
    },
    onChange: () => {
      if (running !== null || motionCheck !== null) return;
      setPhase(menu.open ? "menu" : "lobby");
      showPlatformViews();
      options.onChange?.();
    },
  });

  /** Ends the calibration, measured or skipped, and goes back to the lobby. */
  function endCalibration(): void {
    if (calibration === null) return;
    calibration.dispose();
    calibration = null;
    setPhase("lobby");
    showPlatformViews();
    options.onChange?.();
  }

  function setPhase(next: HostPhase): void {
    if (phase === next) return;
    phase = next;
    options.send({ t: "room:phase", d: { phase: next } });
  }

  /**
   * The lobby, calibration or menu views of every seated phone. The VIP's lobby view carries the
   * game buttons.
   */
  function showPlatformViews(): void {
    if (lobby === null || running !== null) return;
    if (motionCheck !== null) {
      views.show(null, motionCheck.views());
      return;
    }
    if (calibration !== null) {
      views.show(null, calibration.views());
      return;
    }
    if (menu.open) {
      views.show(null, menu.views());
      return;
    }
    const leader = vip(lobby)?.id;
    const lobbyViews = new Map<string, ControllerView>();
    for (const player of seatedPlayers(lobby)) {
      lobbyViews.set(player.id, { screen: "lobby", data: { vip: player.id === leader } });
    }
    views.show(null, lobbyViews);
  }

  /** Every seated phone's results view: the VIP's actions, others' placement or `next-game`. */
  function showResultsViews(): void {
    if (results === null) return;
    views.show(null, results.views());
  }

  /** Starts `game`, with the motion step first when it needs motion. */
  function begin(game: CouchcadeGame): void {
    if (lobby === null) return;
    if (!game.needsMotion) {
      start(game, lobby, new Set());
      return;
    }
    menu.close(game.id);
    results = null;
    motionSteps += 1;
    const check = createMotionCheck({
      game,
      step: motionSteps,
      lobby: () => lobby,
      schedule,
      onDone: (touch) => {
        if (motionCheck !== check) return;
        motionCheck = null;
        // Players may have left while the phones answered. Then the VIP picks again.
        if (lobby !== null && fits(game, seatedPlayers(lobby).length)) {
          start(game, lobby, new Set(touch));
          return;
        }
        const leaderId = lobby === null ? undefined : vip(lobby)?.id;
        if (leaderId !== undefined) menu.action(leaderId, { action: "start" });
        setPhase(menu.open ? "menu" : "lobby");
        showPlatformViews();
        options.onChange?.();
      },
      onChange: () => options.onChange?.(),
    });
    motionCheck = check;
    setPhase("motion-check");
    showPlatformViews();
    options.onChange?.();
  }

  function start(game: CouchcadeGame, state: LobbyState, touchPlayers: Set<string>): void {
    menu.close(game.id);
    results = null;
    // Read once per game, so a game sees one value from start to end.
    const displayLagMs = displayLag.ms();
    const runner = createGameRunner(game, {
      players: seatedPlayers(state),
      seed: createSeed(),
      displayLagMs,
    });
    const loop = createFixedStepLoop({
      now,
      schedule,
      onTick: () => {
        const outcome = runner.step();
        if (outcome) end(outcome);
        else views.show(game.id, runner.views());
      },
    });
    const current = { game, runner, loop, touchPlayers };
    running = current;

    setPhase("playing");
    views.show(game.id, runner.views());
    options.onChange?.();

    const beginTicking = (): void => {
      if (running !== current) return;
      // Tick 0 is now, so inputs are judged on game time from the moment the game can be seen.
      runner.begin(clock.toHostTime(now()));
      loop.start();
    };
    options.stage
      .start(game, {
        getState: () => runner.state,
        players: runner.players,
        displayLagMs,
        reducedMotion: reducedMotion(),
        roomCode: state.code,
        joinUrl: origin === undefined ? undefined : joinUrl(origin, state.code),
      })
      .then(
        () => {
          if (running === current) beginTicking();
          else options.stage.stop(game);
        },
        (error: unknown) => {
          warn(`${game.id} host scene failed to load: ${String(error)}`);
          beginTicking();
        },
      );
  }

  /** The game ended: stops the loop and scene and shows the results screen (session-flow.md,
   * "Results"). "Play again" restarts the same game, "Back to menu" opens the menu. */
  function end(outcome: Outcome): void {
    if (running === null) return;
    const { game, runner, loop } = running;
    loop.stop();
    options.stage.stop(game);
    running = null;
    results = createGameResults({
      game,
      outcome,
      players: runner.players,
      lobby: () => lobby,
      onPlayAgain: (g) => {
        results = null;
        begin(g);
      },
      onBackToMenu: () => {
        results = null;
        // The VIP is still seated: `action` below only reaches here after matching them.
        if (lobby === null) return;
        const leaderId = vip(lobby)?.id;
        if (leaderId !== undefined) menu.action(leaderId, { action: "start" });
      },
    });
    setPhase("results");
    showResultsViews();
    options.onChange?.();
  }

  return {
    get phase() {
      return phase;
    },

    get running() {
      return running;
    },

    get menu() {
      return phase === "menu" ? { games: menu.games(), countdown: menu.countdown } : null;
    },

    get results() {
      return phase === "results" && results !== null
        ? {
            game: results.game,
            standings: results.standings,
            podium: results.podium,
            headline: results.headline,
            canPlayAgain: results.canPlayAgain,
            hint: results.hint,
          }
        : null;
    },

    get calibration() {
      return phase === "calibration" && calibration !== null
        ? {
            status: calibration.status,
            startsAt: calibration.startsAt,
            measurement: calibration.measurement(),
          }
        : null;
    },

    get motion() {
      return phase === "motion-check" && motionCheck !== null
        ? { game: motionCheck.game, players: motionCheck.players() }
        : null;
    },

    get displayLag() {
      return displayLag.read();
    },

    checkTvLag() {
      if (phase !== "lobby" || running !== null || menu.open || lobby === null) return;
      calibration = createCalibration({
        lobby: () => lobby,
        roomNow: () => clock.toHostTime(now()),
        schedule,
        onMeasured: (lagMs) => {
          displayLag.save(lagMs);
          endCalibration();
        },
        onSkip: endCalibration,
        onChange: () => {
          showPlatformViews();
          options.onChange?.();
        },
      });
      setPhase("calibration");
      showPlatformViews();
      options.onChange?.();
    },

    skipCalibration: endCalibration,

    retryCalibration() {
      calibration?.retry();
    },

    calibrationFrame(roomTime) {
      return calibration?.frame(roomTime) ?? null;
    },

    handle(message, state) {
      lobby = state;
      switch (message.t) {
        case "room:welcome":
          clock.connect((d) => options.send({ t: "clock:ping", d }));
          // The relay remembers a different phase than this TV runs: the TV was refreshed, or a
          // phase change got lost with the socket. Without a snapshot to resume from (CC-3.5),
          // the relay follows the TV.
          if (running === null && message.d.phase !== phase) {
            options.send({ t: "room:phase", d: { phase } });
          }
          return;
        case "clock:pong":
          clock.receive(message.d);
          return;
        case "input":
          if (running && !running.runner.queue(message.from, message.d)) {
            warn(`dropped input ${JSON.stringify(message.d.type)} from ${message.from}`);
          }
          return;
        case "calibration:tap":
          calibration?.tap(message.from, message.d);
          return;
        case "motion:status":
          if (motionCheck !== null) {
            motionCheck.answer(message.from, message.d.status);
          } else if (running !== null && running.game.needsMotion) {
            // A phone whose sensors stopped during the game plays on with touch (motion.md flow
            // rule 7). A phone can't switch back to motion mid-game.
            const inGame = running.runner.players.some((player) => player.id === message.from);
            if (inGame && isTouch(message.d.status) && !running.touchPlayers.has(message.from)) {
              running.touchPlayers.add(message.from);
              options.onChange?.();
            }
          }
          return;
        case "ui:action":
          // The motion step takes no platform actions: the game is already picked.
          if (running !== null || motionCheck !== null) return;
          // During the TV lag check only the VIP's skip-calibration counts.
          if (calibration !== null) calibration.action(message.from, message.d);
          else if (phase === "results") results?.action(message.from, message.d);
          else menu.action(message.from, message.d);
          return;
        case "player:joined":
        case "player:reconnected": {
          // A phone that came back (or a newer tab) has no view yet: send it the current one in the
          // next send window, even when it didn't change.
          const id = message.t === "player:joined" ? message.d.player.id : message.d.id;
          views.forget(id);
          break;
        }
        case "player:left":
          // A short drop keeps the seat and the game isn't told. A freed seat ends that player's game.
          if (message.d.reason !== "disconnected") running?.runner.leave(message.d.id);
          break;
        default:
          break;
      }
      // Presence changed: the VIP, the seated count and so the grey cards, "can play again" or "not
      // in this game" state may have changed. Phones that joined or came back get their view too.
      // While a game runs, its next tick sends the views.
      if (running !== null) return;
      if (motionCheck !== null) {
        // A player who left no longer holds the step up, which may start the game. Otherwise
        // joiners and returning phones get the step too.
        const check = motionCheck;
        check.refresh();
        if (motionCheck === check) {
          showPlatformViews();
          options.onChange?.();
        }
      } else if (phase === "results") {
        showResultsViews();
        options.onChange?.();
      } else {
        showPlatformViews();
        if (phase === "menu") options.onChange?.();
      }
    },

    disconnected() {
      clock.disconnect();
    },

    dispose() {
      menu.dispose();
      calibration?.dispose();
      calibration = null;
      motionCheck?.dispose();
      motionCheck = null;
      if (running) {
        running.loop.stop();
        options.stage.stop(running.game);
        running = null;
      }
      clock.disconnect();
      views.dispose();
    },
  };
}
