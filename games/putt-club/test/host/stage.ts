import { vi } from "vitest";
import { createFakeRoom } from "@couchcade/game-sdk/testing";
import { color } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { HostSceneData, Player } from "@couchcade/game-sdk/contract";
import { AUTO, Game, GameObjects, Scenes } from "phaser";
import type { Scene } from "phaser";
import game from "../../src/index.ts";
import type PuttClubScene from "../../src/host/scene.ts";
import type { PuttClubState } from "../../src/shared/index.ts";

/**
 * Boots the scene the way the host stage does (apps/host/src/stage/boot.ts and
 * runtime/stage.ts), the same setup Bandeja's `test/host/stage.ts` uses. Putt Club has no bot AI
 * yet (CC-13.6 is a later story), so tests drive the match purely through `createFakeRoom` and
 * the game's own deterministic auto-putt-after-deadline mechanism (docs/games/putt-club.md,
 * "Stroke flow and timings", rule 5) -- ticking with no input at all still plays a full match to
 * `over`, one auto-putt per turn.
 */

export const tv = { width: 1920, height: 1080 } as const;

let fonts: Promise<void> | null = null;

/** The self-hosted fonts from packages/theme/fonts (CC-4.3), which the host loads before a scene. */
function loadFonts(): Promise<void> {
  fonts ??= (async () => {
    const fredoka = new URL(
      "../../../../packages/theme/fonts/fredoka/fredoka.woff2",
      import.meta.url,
    );
    const pixelify = new URL(
      "../../../../packages/theme/fonts/pixelify-sans/pixelify-sans.woff2",
      import.meta.url,
    );
    const faces = [
      new FontFace("Fredoka", `url(${fredoka.href})`, { weight: "500 700" }),
      new FontFace("Pixelify Sans", `url(${pixelify.href})`, { weight: "700" }),
    ];
    for (const face of faces) document.fonts.add(await face.load());
  })();
  return fonts;
}

export async function bootStage(canvas: { width: number; height: number }): Promise<Game> {
  await loadFonts();
  const parent = document.createElement("div");
  document.body.append(parent);
  const stage = new Game({
    type: AUTO,
    parent,
    width: canvas.width,
    height: canvas.height,
    backgroundColor: color.ink,
    pixelArt: true,
    banner: false,
    audio: { noAudio: true },
  });
  if (!stage.isRunning) await new Promise((resolve) => stage.events.once("ready", resolve));
  // Frames run only when the test steps them.
  stage.loop.stop();
  return stage;
}

/** Destroys a stage booted by `bootStage`. */
export function destroyStage(stage: Game | null): void {
  stage?.destroy(true);
  // The loop is stopped, so run the frame that finishes the destroy and frees the WebGL context.
  stage?.step(0, 0);
}

export interface StartOptions {
  reducedMotion?: boolean;
  canvas?: { width: number; height: number };
  room?: boolean;
}

/** Not hand-typed as `FakeRoom<PuttClubInput, PuttClubState, PuttClubControllerView>`: TS infers a
 * structurally-equal but nominally distinct `TView` for `createFakeRoom(game, ...)` from `game`'s
 * own recursive `JsonValue` typing, so `Run` is derived from this function's own return instead of
 * risking the two falling out of sync (below). */
export async function startScene(
  players: number | readonly Player[],
  seed: number,
  options: StartOptions = {},
) {
  const stage = await bootStage(options.canvas ?? { width: 480, height: 270 });
  const room = createFakeRoom(game, { players, seed });
  const data: HostSceneData<PuttClubState> = {
    getState: () => room.state,
    players: room.players,
    displayLagMs: 0,
    reducedMotion: options.reducedMotion ?? false,
    ...(options.room === false
      ? {}
      : { roomCode: "BEAN", joinUrl: "https://couchcade.workers.dev/?room=BEAN" }),
  };
  const SceneClass = await game.hostScene();
  stage.scene.add(game.id, SceneClass, true, data as unknown as object);

  let time = 0;
  const render = (): void => {
    time += tickMs;
    stage.step(time, tickMs);
  };
  await vi.waitFor(
    () => {
      render();
      const scene = stage.scene.getScene(game.id);
      if (scene?.sys.settings.status !== Scenes.RUNNING) throw new Error("Not running yet");
    },
    { timeout: 10_000, interval: 5 },
  );
  const scene = stage.scene.getScene(game.id) as PuttClubScene;
  return {
    stage,
    scene,
    room,
    tick: () => room.step(),
    render,
    frame: () => {
      const state = room.step();
      render();
      return state;
    },
  };
}

export type Run = Awaited<ReturnType<typeof startScene>>;

/** Every game object on screen, walking into layers and containers, with its visibility. */
export function shown(scene: Scene): GameObjects.GameObject[] {
  const found: GameObjects.GameObject[] = [];
  const walk = (list: readonly GameObjects.GameObject[]) => {
    for (const child of list) {
      if ("visible" in child && child.visible === false) continue;
      found.push(child);
      if (child instanceof GameObjects.Layer || child instanceof GameObjects.Container) {
        walk(child.list);
      }
    }
  };
  walk(scene.children.list);
  return found;
}

/** Visible text in the scene, the overlay layer included. */
export function visibleTexts(scene: Scene): GameObjects.Text[] {
  return shown(scene).filter(
    (child): child is GameObjects.Text => child instanceof GameObjects.Text && child.text !== "",
  );
}
