import type {
  ControllerMotion,
  ControllerProps,
  CouchcadeController,
  GameInput,
} from "@couchcade/game-sdk/contract";
import type { ControllerRegistry } from "@couchcade/game-sdk/registry";
import type { Calibration } from "@couchcade/motion/calibration";
import type { MotionAdapter } from "@couchcade/motion/sensors";
import type { JsonValue } from "@couchcade/protocol";
import { markRaw, shallowRef, watch, type Component, type ShallowRef } from "vue";
import type { MotionGame } from "../motion/session.ts";
import type { PhoneState } from "../session/state.ts";
import type { InputSender } from "./send.ts";

type RoomState = Extract<PhoneState, { status: "room" }>;

/** A room state whose last `controller:state` belongs to a game. */
export type GameState = RoomState & { gameId: string; view: NonNullable<RoomState["view"]> };

/**
 * True when the phone shows the running game's controller: the host sent a view with a `gameId`,
 * and the socket and the TV are both there. Otherwise the platform screens take over
 * ("Connection lost", "Waiting for the TV").
 */
export function showsGameController(state: PhoneState): state is GameState {
  return (
    state.status === "room" &&
    state.gameId !== null &&
    state.view !== null &&
    state.online &&
    state.hostConnected
  );
}

/** The motion result a game controller on this phone gets. */
export type PhoneMotion = ControllerMotion<MotionAdapter, Calibration>;

/**
 * The props a game's controller component gets (`ControllerProps` from the game contract).
 * `motion` is only there when the motion step ran for this game.
 */
export function controllerProps(
  state: GameState,
  send: InputSender,
  motion?: PhoneMotion,
): ControllerProps<JsonValue, GameInput, PhoneMotion> {
  const props = { screen: state.view.screen, data: state.view.data, player: state.you, send };
  return motion === undefined ? props : { ...props, motion };
}

/**
 * What the motion step settled on for the running game `gameId` (docs/architecture/platform.md,
 * "How the phone shows a controller"). Motion only once the phone calibrated; every other outcome
 * of the step is touch, including a step the host started the game without, and a switch to touch
 * mid-game. Undefined when no motion step ran for this game, such as for a game without
 * `needsMotion` or after a reload mid-game.
 */
export function controllerMotion(
  game: MotionGame | null,
  gameId: string,
  adapter: () => MotionAdapter,
): PhoneMotion | undefined {
  if (game === null || game.gameId !== gameId) return undefined;
  if (game.flow.kind === "ready" && game.calibration !== null) {
    return { mode: "motion", adapter: adapter(), calibration: game.calibration };
  }
  return { mode: "touch" };
}

export type ControllerStatus =
  | { kind: "loading"; gameId: string }
  | { kind: "ready"; gameId: string; component: Component }
  | { kind: "missing"; gameId: string };

/**
 * Loads the controller component of the game `gameId()` names, lazily and once per game, and
 * follows it when the game changes. An id the registry doesn't know, or an entry or chunk that
 * fails to load, ends as `missing`. A load for a game that is no longer running is ignored.
 */
export function useGameController(
  gameId: () => string,
  registry: Pick<ControllerRegistry, "load">,
): Readonly<ShallowRef<ControllerStatus>> {
  const status = shallowRef<ControllerStatus>({ kind: "loading", gameId: gameId() });

  watch(
    gameId,
    (id) => {
      status.value = { kind: "loading", gameId: id };
      registry
        .load(id)
        .then((entry: CouchcadeController) => entry.component())
        .then(
          (component) => {
            if (gameId() !== id) return;
            status.value = { kind: "ready", gameId: id, component: markRaw(component) };
          },
          () => {
            if (gameId() !== id) return;
            status.value = { kind: "missing", gameId: id };
          },
        );
    },
    { immediate: true },
  );

  return status;
}
