import {
  getDisplayLagMs,
  readDisplayLag,
  roomClock,
  saveDisplayLag,
} from "@couchcade/game-sdk/clock";
import type { RoomClock, StoredDisplayLag } from "@couchcade/game-sdk/clock";
import type { CouchcadeGame, Outcome, Player } from "@couchcade/game-sdk/contract";
import type { GameMetaRegistry, LazyGameRegistry } from "@couchcade/game-sdk/registry";
import type {
  ControllerView,
  HostToRelayMessage,
  RelayToHostMessage,
  RoomPhase,
} from "@couchcade/protocol";
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
import { audienceViews, seatedPlayers, vip } from "../screens/lobby/lobby-state.ts";
import { joinUrl } from "../screens/lobby/join-url.ts";
import { createGameMenu, fits } from "../screens/menu/menu.ts";
import type { Countdown, GameMenu, MenuGame } from "../screens/menu/menu.ts";
import { createGameResults } from "../screens/results/results.ts";
import type { GameResults, ResultsStanding } from "../screens/results/results.ts";
import { createFixedStepLoop } from "./fixed-step.ts";
import type { FixedStepLoop } from "./fixed-step.ts";
import { createGameRunner } from "./game-runner.ts";
import type { GameRunner } from "./game-runner.ts";
import { createHostLinks } from "./links.ts";
import type { HostLinkPeer } from "./links.ts";
import { createSnapshotSender, planRecovery } from "./recovery.ts";
import type { RoomSnapshot, SnapshotResume, SnapshotSender } from "./recovery.ts";
import type { GameStage } from "./stage.ts";
import { devWarn, localNow, scheduleTimeout } from "./timing.ts";
import type { Scheduler } from "./timing.ts";
import { createViewSync } from "./view-sync.ts";

export interface HostRuntimeOptions {
  /** Eager: every game's title and player count, for the menu (CC-3.25). */
  metaRegistry: GameMetaRegistry;
  /** Lazy: a game's full rules, loaded once when a room actually starts it (CC-3.25). */
  gameRegistry: LazyGameRegistry;
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
  /** Builds the answer-side WebRTC peer connection for a phone's link (CC-3.20). Defaults to a
   * real `RTCPeerConnection` with `iceServers: []`; tests inject a fake. */
  createLinkPeer?: () => HostLinkPeer | null;
  /** The link switch for this TV session (`runtime/link-switch.ts`). Defaults to
   * `realtimeLinkEnabled`. */
  linkEnabled?: () => boolean;
}

/** Reads and stores the calibrated TV lag (session-flow.md, "Storage and use"). */
export interface DisplayLagStore {
  /** The lag games get, 0 when the TV was never calibrated. */
  ms(): number;
  /** The stored measurement, or null. */
  read(): StoredDisplayLag | null;
  save(ms: number): void;
}

/** What a seated player who isn't in the running game sees until the next one starts. */
const nextGameView: ControllerView = { screen: "next-game", data: null };

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
  /** A line for the TV, such as "The TV restarted, so that game ended", or null. */
  notice: string | null;
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
   * "End game" (CC-3.27): stops the running game and reopens the menu for the VIP, the same way
   * "Back to menu" already does after a natural finish. There's nothing to show for a game that
   * didn't finish, so this skips the results screen. Does nothing outside a running game. The
   * TV's own button calls this directly and always may; a phone's `ui:action` is gated to the
   * current VIP in `handle()`.
   */
  endGameEarly(): void;
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
 *
 * While a game runs, round snapshots go to the relay (recovery.ts). A refreshed TV rejoins, waits for
 * its clock samples and picks up where the room was: the running game resumes at the start of its
 * next round, and other phases go back to the menu or the lobby (session-flow.md, "Recovery").
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
  let running:
    | (RunningGame & { loop: FixedStepLoop; touchPlayers: Set<string>; snapshots: SnapshotSender })
    | null = null;
  // Answer-side WebRTC links (CC-3.20, docs/architecture/realtime-link.md). `isSeatedPlayer` and
  // `onInput` read `lobby` and `running` above through closures, same as the rest of this runtime;
  // `links` itself owns no timer, matching the doc's "the link code sets no host timers".
  const links = createHostLinks({
    sendMessage: options.send,
    isSeatedPlayer: (id) =>
      lobby !== null && seatedPlayers(lobby).some((player) => player.id === id),
    onInput: (playerId, input) => {
      if (running && !running.runner.queue(playerId, input)) {
        warn(`dropped input ${JSON.stringify(input.type)} from ${playerId}`);
      }
    },
    createPeer: options.createLinkPeer,
    enabled: options.linkEnabled,
    now,
    roomOffsetMs: () => clock.offsetMs ?? 0,
    schedule,
    warn,
  });
  let results: GameResults | null = null;
  let calibration: Calibration | null = null;
  let motionCheck: MotionCheck | null = null;
  /** Counts motion steps, so a phone asks again for "Play again". */
  let motionSteps = 0;
  /** The phase last sent to the relay with `room:phase`. */
  let phase: HostPhase = "lobby";
  /** True once the relay welcomed this runtime. Only the first welcome of a new TV tab recovers. */
  let welcomed = false;
  /** True once `dispose()` ran: a game load already in flight (CC-3.25) must not resurrect it. */
  let disposed = false;
  /**
   * Set from a refreshed TV's `room:welcome` until its clock is synced: the phase the relay stored
   * and the `room:snapshot` it sent. Platform actions and views wait meanwhile.
   */
  let recovery: { phase: RoomPhase; snapshot: RoomSnapshot | null } | null = null;
  /** Counts recoveries, so a welcome on a newer socket makes an older one's wait do nothing. */
  let recoveries = 0;
  /** The TV menu's notice line. */
  let menuNotice: string | null = null;

  const menu: GameMenu = createGameMenu({
    registry: options.metaRegistry,
    lobby: () => lobby,
    roomNow: () => clock.toHostTime(now()),
    schedule,
    random: options.random,
    onStart: (gameId) => {
      if (lobby !== null && running === null) begin(gameId);
    },
    onChange: () => {
      if (running !== null || motionCheck !== null) return;
      if (!menu.open || menu.countdown !== null) menuNotice = null;
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

  /**
   * Sends `screenViews` with what every other phone should see (session-flow.md, "What each device
   * shows"): audience phones get their place in line, and while a game runs, seated players who
   * aren't in it (`inGame`) get `next-game`.
   */
  function show(
    gameId: string | null,
    screenViews: ReadonlyMap<string, ControllerView>,
    inGame?: readonly Player[],
  ): void {
    if (lobby === null) {
      views.show(gameId, screenViews);
      return;
    }
    const all = new Map(screenViews);
    if (inGame !== undefined) {
      for (const player of seatedPlayers(lobby)) {
        if (!all.has(player.id) && !inGame.some(({ id }) => id === player.id)) {
          all.set(player.id, nextGameView);
        }
      }
    }
    for (const [id, view] of audienceViews(lobby)) all.set(id, view);
    views.show(gameId, all);
  }

  /**
   * Merges the current VIP's id into every per-player running-game view (CC-3.28): a platform-owned
   * sibling of the game's own `data`, so the game never sees or sets it (`controllerProps` in
   * apps/controller/src/runtime/controller.ts only forwards `screen` and `data`). Recomputed from
   * `lobby` on every call, so it follows the VIP if they disconnect mid-game (lobby-state.ts's
   * `vip()` already picks the next connected seated player).
   */
  function withVip(gameViews: ReadonlyMap<string, ControllerView>): Map<string, ControllerView> {
    const leaderId = lobby === null ? undefined : vip(lobby)?.id;
    return new Map(
      [...gameViews].map(([id, view]) => [id, { ...view, vip: id === leaderId }] as const),
    );
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
      show(null, motionCheck.views());
      return;
    }
    if (calibration !== null) {
      show(null, calibration.views());
      return;
    }
    if (menu.open) {
      show(null, menu.views());
      return;
    }
    const leader = vip(lobby)?.id;
    const lobbyViews = new Map<string, ControllerView>();
    for (const player of seatedPlayers(lobby)) {
      lobbyViews.set(player.id, { screen: "lobby", data: { vip: player.id === leader } });
    }
    show(null, lobbyViews);
  }

  /** Every seated phone's results view: the VIP's actions, others' placement or `next-game`. */
  function showResultsViews(): void {
    if (results === null) return;
    show(null, results.views());
  }

  /** Loads `gameId`'s full rules (CC-3.25), then starts it. A dropped chunk goes back to the menu. */
  function begin(gameId: string): void {
    if (lobby === null) return;
    void options.gameRegistry.load(gameId).then(
      (game) => {
        if (!disposed && lobby !== null && running === null) beginLoaded(game);
      },
      (error: unknown) => {
        warn(`${gameId} failed to load: ${String(error)}`);
        if (disposed || lobby === null || running !== null) return;
        menuNotice = "That game couldn't load. Try again.";
        const leaderId = vip(lobby)?.id;
        if (leaderId !== undefined) menu.action(leaderId, { action: "start" });
        setPhase(menu.open ? "menu" : "lobby");
        showPlatformViews();
        options.onChange?.();
      },
    );
  }

  /** Starts `game`, with the motion step first when it needs motion. */
  function beginLoaded(game: CouchcadeGame): void {
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

  /**
   * Starts `game` with the seated players, or, with `restored`, resumes it from a snapshot with the
   * in-game players still seated.
   */
  function start(
    game: CouchcadeGame,
    state: LobbyState,
    touchPlayers: Set<string>,
    restored?: { players: readonly Player[]; resume: SnapshotResume },
  ): void {
    menu.close(game.id);
    results = null;
    menuNotice = null;
    // Read once per game, so a game sees one value from start to end.
    const displayLagMs = displayLag.ms();
    const runner = createGameRunner(game, {
      players: restored?.players ?? seatedPlayers(state),
      // A restored game gets a new seed too. Its RNG state comes from the snapshot.
      seed: createSeed(),
      displayLagMs,
      restore: restored?.resume.g,
    });
    const loop = createFixedStepLoop({
      now,
      schedule,
      onTick: () => {
        const outcome = runner.step();
        if (outcome) {
          end(outcome);
          return;
        }
        snapshots.tick();
        show(game.id, withVip(runner.views()), runner.players);
      },
    });
    setPhase("playing");
    // Round 0 right after `init`, replacing any earlier game's snapshot. A restored game keeps the
    // stored one.
    const snapshots = createSnapshotSender({
      game,
      runner,
      send: options.send,
      now,
      schedule,
      warn,
      resume: restored?.resume,
    });
    const current = { game, runner, loop, touchPlayers, snapshots };
    running = current;

    show(game.id, withVip(runner.views()), runner.players);
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
        link: (playerId) => links.link(playerId),
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
    const { game, runner, loop, snapshots } = running;
    loop.stop();
    snapshots.stop();
    options.stage.stop(game);
    running = null;
    results = createGameResults({
      game,
      outcome,
      players: runner.players,
      lobby: () => lobby,
      onPlayAgain: (g) => {
        results = null;
        // Already loaded once: the registry caches it, so this resolves at once.
        begin(g.id);
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

  /**
   * "End game" (CC-3.27): stops the running game without a results screen and reopens the menu
   * for the VIP, mirroring `begin()`'s dropped-chunk recovery and `finishRecovery()`'s "menu"
   * case above.
   */
  function endGameEarly(): void {
    if (running === null) return;
    const { game, loop, snapshots } = running;
    loop.stop();
    snapshots.stop();
    options.stage.stop(game);
    running = null;
    results = null;
    menuNotice = null;
    const leaderId = lobby === null ? undefined : vip(lobby)?.id;
    if (leaderId !== undefined) menu.action(leaderId, { action: "start" });
    setPhase(menu.open ? "menu" : "lobby");
    showPlatformViews();
    options.onChange?.();
  }

  /**
   * A new TV tab got its first `room:welcome` with a phase other than the lobby: it was refreshed
   * or reopened after a deploy. The relay follows the welcome with `player:joined` for every known
   * player and the stored `room:snapshot`. Those all arrive before the first `clock:pong`, and the
   * host needs its clock samples before it resumes anyway, so it decides once the clock is synced.
   */
  function beginRecovery(relayPhase: RoomPhase): void {
    recoveries += 1;
    const attempt = recoveries;
    recovery = { phase: relayPhase, snapshot: null };
    clock.whenSynced().then(
      () => {
        if (attempt === recoveries) void finishRecovery();
      },
      () => {},
    );
  }

  /**
   * Goes where the recovery table says (session-flow.md, "Recovery"). `planRecovery` awaits a
   * lazy game load (CC-3.25), so a newer recovery or a lost lobby while it was in flight cancels
   * this one instead of clobbering it.
   */
  async function finishRecovery(): Promise<void> {
    if (recovery === null) return;
    const { phase: relayPhase, snapshot } = recovery;
    recovery = null;
    if (lobby === null) return;
    const attempt = recoveries;
    const plan = await planRecovery({
      phase: relayPhase,
      snapshot,
      gameRegistry: options.gameRegistry,
      seated: seatedPlayers(lobby),
    });
    if (attempt !== recoveries || lobby === null) return;
    // The relay is in `relayPhase`, so `room:phase` only goes out when recovery lands elsewhere.
    // This runtime has no party phase yet (CC-8), so a room stored in it goes back to the lobby.
    if (relayPhase === "party") options.send({ t: "room:phase", d: { phase: "lobby" } });
    else phase = relayPhase;
    switch (plan.to) {
      case "playing":
        start(plan.game, lobby, new Set(), plan);
        return;
      case "menu": {
        menuNotice = plan.notice;
        const leaderId = vip(lobby)?.id;
        if (leaderId !== undefined) menu.action(leaderId, { action: "start" });
        break;
      }
      case "lobby":
        break;
    }
    if (!menu.open) {
      menuNotice = null;
      setPhase("lobby");
    }
    showPlatformViews();
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
      return phase === "menu"
        ? { games: menu.games(), countdown: menu.countdown, notice: menuNotice }
        : null;
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

    endGameEarly,

    retryCalibration() {
      calibration?.retry();
    },

    calibrationFrame(roomTime) {
      return calibration?.frame(roomTime) ?? null;
    },

    handle(message, state) {
      lobby = state;
      switch (message.t) {
        case "room:welcome": {
          clock.connect((d) => options.send({ t: "clock:ping", d }));
          const fresh =
            !welcomed &&
            phase === "lobby" &&
            running === null &&
            !menu.open &&
            calibration === null &&
            motionCheck === null;
          welcomed = true;
          // A refreshed TV, or its socket dropped again before it had recovered.
          if ((fresh || recovery !== null) && message.d.phase !== "lobby") {
            beginRecovery(message.d.phase);
            return;
          }
          recovery = null;
          // The relay remembers a different phase than this TV runs, because a phase change got
          // lost with the socket. The relay follows the TV.
          if (running === null && message.d.phase !== phase) {
            options.send({ t: "room:phase", d: { phase } });
          }
          return;
        }
        case "room:snapshot":
          // Only a TV that is recovering reads it. A TV whose socket just reconnected runs the game.
          if (recovery !== null) recovery = { ...recovery, snapshot: message.d };
          return;
        case "clock:pong":
          clock.receive(message.d);
          return;
        case "rtc:offer":
          links.receiveOffer(message.from, message.d);
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
          // "End game" (CC-3.27): only while a game runs, and only the current VIP's tap counts
          // -- the same moderation shape as kick (apps/server/src/room/moderation.ts), applied
          // here because only the host runtime knows who the VIP is.
          if (message.d.action === "end-game") {
            if (running !== null && message.from === vip(state)?.id) endGameEarly();
            return;
          }
          // The motion step takes no platform actions: the game is already picked. A recovering TV
          // takes none until it knows where the room was.
          if (running !== null || motionCheck !== null || recovery !== null) return;
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
          // A short drop keeps the seat, the game isn't told and the link stays up (session-flow.md,
          // "Deploys"). A freed seat ends that player's game and closes their link at once (AC4,
          // "Kicks, leaving and expiry").
          if (message.d.reason !== "disconnected") {
            running?.runner.leave(message.d.id);
            links.close(message.d.id);
          }
          break;
        default:
          break;
      }
      // Presence changed: the VIP, the seated count and so the grey cards, "can play again" or "not
      // in this game" state may have changed. Phones that joined or came back get their view too.
      // While a game runs, its next tick sends the views. A recovering TV sends them once it knows
      // where the room is.
      if (running !== null || recovery !== null) return;
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
      disposed = true;
      // Closes every link: the room ends here, whether the host sent `room:end` or the socket
      // closed for another reason (AC4, "Kicks, leaving and expiry" and "on room:end").
      links.closeAll();
      menu.dispose();
      calibration?.dispose();
      calibration = null;
      motionCheck?.dispose();
      motionCheck = null;
      recovery = null;
      recoveries += 1;
      if (running) {
        running.loop.stop();
        running.snapshots.stop();
        options.stage.stop(running.game);
        running = null;
      }
      clock.disconnect();
      views.dispose();
    },
  };
}
