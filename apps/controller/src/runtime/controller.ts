import type { ControllerProps, CouchcadeController, GameInput } from "@couchcade/game-sdk/contract";
import type { ControllerRegistry } from "@couchcade/game-sdk/registry";
import type { JsonValue } from "@couchcade/protocol";
import { markRaw, shallowRef, watch, type Component, type ShallowRef } from "vue";
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

/** The props a game's controller component gets (`ControllerProps` from the game contract). */
export function controllerProps(
  state: GameState,
  send: InputSender,
): ControllerProps<JsonValue, GameInput> {
  return { screen: state.view.screen, data: state.view.data, player: state.you, send };
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
