import { afterEach, describe, expect, it } from "vitest";
import { color, world } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { AUTO, Game, GameObjects, Scenes } from "phaser";
import type { Scene } from "phaser";
import game from "../../src/index.ts";
import { strikeNightCueEvent } from "../../src/host/cues.ts";
import type { StrikeNightCue } from "../../src/host/cues.ts";
import type StrikeNightScene from "../../src/host/scene.ts";
import type { StrikeNightState } from "../../src/shared/index.ts";
import { room } from "../helpers.ts";
import type { StrikeNightRoom } from "../helpers.ts";

/**
 * Boots the scene the way the host stage does (apps/host/src/stage/boot.ts and
 * runtime/stage.ts): a canvas with nearest-neighbour pixels, the scene added under the game id
 * with `HostSceneData`. The stage draws the 480×270 world at a whole-number zoom and the overlays
 * at the canvas resolution. The test drives Phaser by hand, one render per batch of game ticks.
 * CI renders with a software GPU, so a small canvas keeps a full match's worth of renders quick.
 */
const canvas = { width: 960, height: 540 } as const;
let phaser: Game | null = null;

async function bootStage(): Promise<Game> {
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

interface Run {
  scene: StrikeNightScene;
  target: StrikeNightRoom;
  cues: StrikeNightCue[];
  /** Runs `ticks` game ticks (no input: every roll is an auto-roll), then renders one frame. */
  advance: (ticks: number) => StrikeNightState;
}

async function startScene(players: number, seed: number): Promise<Run> {
  const stage = await bootStage();
  phaser = stage;
  const target = room(players, seed);
  const data: HostSceneData<StrikeNightState> = {
    getState: () => target.state,
    players: target.players,
    displayLagMs: 0,
    reducedMotion: false,
    roomCode: "BEAN",
    joinUrl: "https://couchcade.workers.dev/?room=BEAN",
  };
  const SceneClass = await game.hostScene();
  stage.scene.add(game.id, SceneClass, true, data as unknown as object);

  let time = 0;
  const render = (): void => {
    time += tickMs;
    stage.step(time, tickMs);
  };
  await waitForRunning(stage);
  const scene = stage.scene.getScene(game.id) as StrikeNightScene;

  const cues: StrikeNightCue[] = [];
  scene.events.on(strikeNightCueEvent, (cue: StrikeNightCue) => cues.push(cue));
  return {
    scene,
    target,
    cues,
    advance: (ticks) => {
      target.step(ticks);
      render();
      return target.state;
    },
  };
}

/** Steps frames until the scene finishes loading and starts running. */
async function waitForRunning(stage: Game): Promise<void> {
  let time = 0;
  for (let i = 0; i < 200; i++) {
    time += tickMs;
    stage.step(time, tickMs);
    const scene = stage.scene.getScene(game.id);
    if (scene?.sys.settings.status === Scenes.RUNNING) return;
    await Promise.resolve();
  }
  throw new Error("Strike Night's scene never reached RUNNING");
}

/** Every game object on screen, walking into layers and containers, with its visibility. */
function shown(scene: Scene): GameObjects.GameObject[] {
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

afterEach(() => {
  phaser?.destroy(true);
  phaser = null;
  document.body.replaceChildren();
});

describe("StrikeNightScene: boots at 480×270 with an integer zoom", () => {
  it("fits the world at the largest whole-number zoom on a 960×540 canvas", async () => {
    const { scene } = await startScene(1, 1);
    const zoom = scene.cameras.main.zoom;
    expect(Number.isInteger(zoom)).toBe(true);
    expect(zoom).toBeGreaterThanOrEqual(1);
    expect(zoom * world.width).toBeLessThanOrEqual(canvas.width);
    expect(zoom * world.height).toBeLessThanOrEqual(canvas.height);
  });

  it("extends StageScene and uses the stage overlays for scores and callouts", async () => {
    const { scene } = await startScene(2, 1);
    expect(scene.overlay).toBeDefined();
    const texts = shown(scene)
      .filter((child): child is GameObjects.Text => child instanceof GameObjects.Text)
      .map((text) => text.text);
    // The Strike Night title callout and the scoreboard's player names.
    expect(texts.some((text) => text === "STRIKE NIGHT")).toBe(true);
    expect(texts.some((text) => text === "Player 1")).toBe(true);
  });
});

describe("StrikeNightScene: a headless boot renders one full round without errors (AC 3)", () => {
  it("renders a whole 1-player match, every roll an auto-roll, to its outcome", async () => {
    const { scene, target, cues, advance } = await startScene(1, 7);
    expect(scene).toBeDefined();

    // Every roll times out (no input is ever sent): 20 s plus the platform's 500 ms late-input
    // wait, worst case ~62 s per frame, 10 frames. A wide but bounded safety cap.
    const tickCap = 60 * 60 * 12; // 12 minutes of game time
    const batch = 60; // render once per game-second
    let ticks = 0;
    while (!target.over && ticks < tickCap) {
      advance(batch);
      ticks += batch;
    }
    expect(target.over).toBe(true);
    expect(target.state.phase).toBe("over");

    // Every roll in this match was an auto-roll.
    expect(target.state.players[0]?.frames.every((frame) => frame.score !== null)).toBe(true);
    expect(cues.some((cue) => cue.type === "lineup")).toBe(true);
    expect(cues.some((cue) => cue.type === "settled")).toBe(true);
  }, 60_000);
});
