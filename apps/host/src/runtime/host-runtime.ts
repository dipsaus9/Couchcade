import { roomClock } from "@couchcade/game-sdk/clock";
import type { RoomClock } from "@couchcade/game-sdk/clock";
import type { CouchcadeGame } from "@couchcade/game-sdk/contract";
import type { GameRegistry } from "@couchcade/game-sdk/registry";
import type { ControllerView, HostToRelayMessage, RelayToHostMessage } from "@couchcade/protocol";
import type { LobbyState } from "../screens/lobby/lobby-state.ts";
import { seatedPlayers, vip } from "../screens/lobby/lobby-state.ts";
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
  /** Called when a game starts or ends, so the TV can switch screens. */
  onChange?(): void;
  /** Defaults to the shared `roomClock`. */
  clock?: RoomClock;
  /** Local clock in milliseconds, on the room clock's local timeline. */
  now?: () => number;
  schedule?: Scheduler;
  /** A fresh game seed. Defaults to 32 random bits from `crypto`. */
  createSeed?: () => number;
  reducedMotion?: () => boolean;
  warn?: (message: string) => void;
}

export interface RunningGame {
  readonly game: CouchcadeGame;
  readonly runner: GameRunner;
}

export interface HostRuntime {
  /** The running game, or null in the lobby. */
  readonly running: RunningGame | null;
  /** Feeds one relay message, with the lobby state after that message was applied. */
  handle(message: RelayToHostMessage, lobby: LobbyState): void;
  /** Tells the runtime the socket closed; it reconnects and gets a new `room:welcome`. */
  disconnected(): void;
  /** Stops everything: game loop, scene, clock sync and pending sends. */
  dispose(): void;
}

const lobbyView: ControllerView = { screen: "lobby", data: null };

/**
 * Runs registered games on the TV (docs/architecture/platform.md, "How the host runs a game"): the
 * VIP starts the first registered game until the menu exists (CC-3.2), the game ticks at a fixed
 * 60 Hz, views go to phones through the view sync, and when the game has an outcome, host and
 * phones return to the lobby. Results (CC-3.3) will replace that last step.
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
  // Seated phones may still show a game's views: after a game, or after a TV refresh mid-game.
  let lobbyViewsOwed = false;

  const showLobbyViews = (): void => {
    if (lobby === null) return;
    views.show(null, new Map(seatedPlayers(lobby).map((player) => [player.id, lobbyView])));
  };

  function start(game: CouchcadeGame, state: LobbyState): void {
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
    lobbyViewsOwed = false;

    options.send({ t: "room:phase", d: { phase: "playing" } });
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
    options.send({ t: "room:phase", d: { phase: "lobby" } });
    lobbyViewsOwed = true;
    showLobbyViews();
    options.onChange?.();
  }

  return {
    get running() {
      return running;
    },

    handle(message, state) {
      lobby = state;
      switch (message.t) {
        case "room:welcome":
          clock.connect((d) => options.send({ t: "clock:ping", d }));
          // The relay still says a game runs, but this TV runs none: it was refreshed mid-game.
          // Without a snapshot to resume from (CC-3.5), the room goes back to the lobby.
          if (running === null && message.d.phase !== "lobby") {
            options.send({ t: "room:phase", d: { phase: "lobby" } });
            lobbyViewsOwed = true;
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
        case "ui:action": {
          if (message.d.action !== "start" || running !== null) return;
          if (message.from !== vip(state)?.id) return;
          const game = options.registry.games[0];
          if (game === undefined) {
            warn("no games registered");
            return;
          }
          const seated = seatedPlayers(state).length;
          if (seated < game.players.min || seated > game.players.max) {
            warn(
              `${game.id} needs ${game.players.min} to ${game.players.max} players, not ${seated}`,
            );
            return;
          }
          start(game, state);
          return;
        }
        default:
          // Presence changed. Phones that joined or came back after a game get the lobby view too.
          if (running === null && lobbyViewsOwed) showLobbyViews();
      }
    },

    disconnected() {
      clock.disconnect();
    },

    dispose() {
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
