import { roomClock } from "@couchcade/game-sdk/clock";
import type { RoomClock } from "@couchcade/game-sdk/clock";
import type { CouchcadeGame } from "@couchcade/game-sdk/contract";
import type { GameRegistry } from "@couchcade/game-sdk/registry";
import type { ControllerView, HostToRelayMessage, RelayToHostMessage } from "@couchcade/protocol";
import type { LobbyState } from "../screens/lobby/lobby-state.ts";
import { seatedPlayers, vip } from "../screens/lobby/lobby-state.ts";
import { createGameMenu } from "../screens/menu/menu.ts";
import type { Countdown, GameMenu, MenuGame } from "../screens/menu/menu.ts";
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
}

export interface RunningGame {
  readonly game: CouchcadeGame;
  readonly runner: GameRunner;
}

/** The phases this runtime drives today. Results, calibration and motion check come later. */
export type HostPhase = "lobby" | "menu" | "playing";

/** What the TV menu draws. */
export interface MenuScreenState {
  games: MenuGame[];
  countdown: Countdown | null;
}

export interface HostRuntime {
  readonly phase: HostPhase;
  /** The running game, or null outside a game. */
  readonly running: RunningGame | null;
  /** The menu's games and countdown while the phase is `menu`, else null. */
  readonly menu: MenuScreenState | null;
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
 * through the view sync, and when the game has an outcome, host and phones return to the lobby.
 * Results (CC-3.3) will replace that last step.
 */
export function createHostRuntime(options: HostRuntimeOptions): HostRuntime {
  const clock = options.clock ?? roomClock;
  const now = options.now ?? localNow;
  const schedule = options.schedule ?? scheduleTimeout;
  const warn = options.warn ?? devWarn;
  const createSeed = options.createSeed ?? (() => crypto.getRandomValues(new Uint32Array(1))[0]!);
  const reducedMotion = options.reducedMotion ?? (() => false);

  const views = createViewSync({ send: options.send, now, schedule, warn });
  let lobby: LobbyState | null = null;
  let running: (RunningGame & { loop: FixedStepLoop }) | null = null;
  /** The phase last sent to the relay with `room:phase`. */
  let phase: HostPhase = "lobby";

  const menu: GameMenu = createGameMenu({
    registry: options.registry,
    lobby: () => lobby,
    roomNow: () => clock.toHostTime(now()),
    schedule,
    random: options.random,
    onStart: (game) => {
      if (lobby !== null && running === null) start(game, lobby);
    },
    onChange: () => {
      if (running !== null) return;
      setPhase(menu.open ? "menu" : "lobby");
      showPlatformViews();
      options.onChange?.();
    },
  });

  function setPhase(next: HostPhase): void {
    if (phase === next) return;
    phase = next;
    options.send({ t: "room:phase", d: { phase: next } });
  }

  /** The lobby or menu views of every seated phone. The VIP's lobby view carries the game buttons. */
  function showPlatformViews(): void {
    if (lobby === null || running !== null) return;
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

  function start(game: CouchcadeGame, state: LobbyState): void {
    menu.close(game.id);
    const runner = createGameRunner(game, {
      players: seatedPlayers(state),
      seed: createSeed(),
      displayLagMs: 0,
    });
    const loop = createFixedStepLoop({
      now,
      schedule,
      onTick: () => {
        const outcome = runner.step();
        if (outcome) end();
        else views.show(game.id, runner.views());
      },
    });
    const current = { game, runner, loop };
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
        displayLagMs: 0,
        reducedMotion: reducedMotion(),
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

  function end(): void {
    if (running === null) return;
    const { game, loop } = running;
    loop.stop();
    options.stage.stop(game);
    running = null;
    setPhase("lobby");
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
      return phase === "menu" ? { games: menu.games(), countdown: menu.countdown } : null;
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
        case "ui:action":
          if (running === null) menu.action(message.from, message.d);
          return;
        default:
          // Presence changed: the VIP, the seated count and so the grey cards may have changed.
          // Phones that joined or came back get their view too.
          if (running === null) {
            showPlatformViews();
            if (phase === "menu") options.onChange?.();
          }
      }
    },

    disconnected() {
      clock.disconnect();
    },

    dispose() {
      menu.dispose();
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
