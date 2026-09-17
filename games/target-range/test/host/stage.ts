import { vi } from "vitest";
import { color } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { HostSceneData, Player } from "@couchcade/game-sdk/contract";
import { AUTO, Game, GameObjects, Scenes } from "phaser";
import type { Scene } from "phaser";
import game from "../../src/index.ts";
import { targetRangeCueEvent } from "../../src/host/cues.ts";
import type { TargetRangeCue } from "../../src/host/cues.ts";
import type TargetRangeScene from "../../src/host/scene.ts";
import type { TargetRangeState } from "../../src/shared/index.ts";
import { botRoom } from "./bots.ts";
import type { BotPlan } from "./bots.ts";

/**
 * Boots the scene the way the host stage does (apps/host/src/stage/boot.ts and runtime/stage.ts):
 * a canvas with nearest-neighbour pixels and the house style fonts loaded, the scene added under
 * the game id with `HostSceneData`. The stage draws the 480×270 world at a whole-number zoom and
 * the overlays at the canvas resolution. Tests drive Phaser by hand, one game tick per frame.
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

export interface Run {
  stage: Game;
  scene: TargetRangeScene;
  cues: TargetRangeCue[];
  /** Runs one game tick without rendering. */
  tick: () => TargetRangeState;
  /** Renders one frame of the latest state. */
  render: () => void;
  /** Runs one game tick and renders one frame. Returns the state that frame showed. */
  frame: () => TargetRangeState;
}

export interface StartOptions {
  reducedMotion?: boolean;
  canvas?: { width: number; height: number };
  room?: boolean;
}

export async function startScene(
  players: number | readonly Player[],
  seed: number,
  plan: BotPlan,
  options: StartOptions = {},
): Promise<Run> {
  const stage = await bootStage(options.canvas ?? { width: 480, height: 270 });
  const bots = botRoom(players, seed, plan);
  const data: HostSceneData<TargetRangeState> = {
    getState: () => bots.room.state,
    players: bots.room.players,
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
  const scene = stage.scene.getScene(game.id) as TargetRangeScene;
  const cues: TargetRangeCue[] = [];
  scene.events.on(targetRangeCueEvent, (cue: TargetRangeCue) => cues.push(cue));
  return {
    stage,
    scene,
    cues,
    tick: bots.step,
    render,
    frame: () => {
      const state = bots.step();
      render();
      return state;
    },
  };
}

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

/** The canvas as a PNG data URL, read back after the next frame. */
export function snapshotPng(stage: Game): Promise<string> {
  return new Promise((resolve) => {
    stage.renderer.snapshot((snapshot) => resolve((snapshot as HTMLImageElement).src));
    stage.step(1e9, tickMs);
  });
}
