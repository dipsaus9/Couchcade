import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { color, toPhaserColor, world } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { AUTO, Game, GameObjects, Scale } from "phaser";
import type { Display, Scene } from "phaser";
import { getScenePalette } from "@couchcade/theme/scenes";
import game from "../../src/index.ts";
import { quickDrawCueEvent } from "../../src/host/cues.ts";
import type { QuickDrawCue } from "../../src/host/cues.ts";
import QuickDrawScene from "../../src/host/scene.ts";
import type { Phase, QuickDrawState } from "../../src/shared/index.ts";
import { botRoom, mixedBots, rotatingBots, seedWithEveryFake } from "./bots.ts";
import type { BotPlan } from "./bots.ts";

/**
 * Boots the scene the way the host stage does (apps/host/src/stage/boot.ts and runtime/stage.ts):
 * a 480×270 world with nearest-neighbour pixels and a whole-number zoom, the scene added under
 * the game id with `HostSceneData`. The test drives Phaser by hand, one game tick per frame.
 */

const zoom = 2;
let phaser: Game | null = null;
let problems: unknown[] = [];

async function bootStage(): Promise<Game> {
  const parent = document.createElement("div");
  document.body.append(parent);
  const stage = new Game({
    type: AUTO,
    parent,
    width: world.width,
    height: world.height,
    backgroundColor: color.ink,
    pixelArt: true,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Scale.NONE, zoom },
  });
  if (!stage.isRunning) await new Promise((resolve) => stage.events.once("ready", resolve));
  // Frames run only when the test steps them.
  stage.loop.stop();
  return stage;
}

interface Run {
  scene: Scene;
  cues: QuickDrawCue[];
  /** Runs one game tick and renders one frame. Returns the state that frame showed. */
  frame: () => QuickDrawState;
}

async function startScene(
  players: number,
  seed: number,
  plan: BotPlan = mixedBots,
  options: { reducedMotion?: boolean } = {},
): Promise<Run> {
  const stage = await bootStage();
  phaser = stage;
  const bots = botRoom(players, seed, plan);
  const data: HostSceneData<QuickDrawState> = {
    getState: () => bots.room.state,
    players: bots.room.players,
    displayLagMs: 0,
    reducedMotion: options.reducedMotion ?? false,
  };
  const SceneClass = await game.hostScene();
  stage.scene.add(game.id, SceneClass, true, data as unknown as object);

  let time = 0;
  const render = (): void => {
    time += tickMs;
    stage.step(time, tickMs);
  };
  // Two frames: the scene manager starts the scene on the first, creates it, then updates.
  render();
  render();
  const scene = stage.scene.getScene(game.id);
  if (scene === null) throw new Error("The Quick Draw scene didn't start");

  const cues: QuickDrawCue[] = [];
  scene.events.on(quickDrawCueEvent, (cue: QuickDrawCue) => cues.push(cue));
  return {
    scene,
    cues,
    frame: () => {
      const state = bots.step();
      render();
      return state;
    },
  };
}

/** Visible text objects in the scene. */
function visibleTexts(scene: Scene): string[] {
  return scene.children.list
    .filter((child): child is GameObjects.Text => child instanceof GameObjects.Text)
    .filter((text) => text.visible && text.text !== "")
    .map((text) => text.text);
}

function readPixel(stage: Game, x: number, y: number): Promise<number> {
  return new Promise((resolve) => {
    stage.renderer.snapshotPixel(x, y, (snapshot) => {
      const { red, green, blue } = snapshot as Display.Color;
      resolve((red << 16) | (green << 8) | blue);
    });
    stage.step(1e6, tickMs);
  });
}

beforeEach(() => {
  problems = [];
  vi.spyOn(console, "error").mockImplementation((...args) => problems.push(args));
  vi.spyOn(console, "warn").mockImplementation((...args) => problems.push(args));
});

afterEach(() => {
  vi.restoreAllMocks();
  phaser?.destroy(true);
  // The loop is stopped, so run the frame that finishes the destroy and frees the WebGL context.
  phaser?.step(0, 0);
  phaser = null;
});

describe("Quick Draw TV scene", () => {
  it("loads through the game's hostScene loader", async () => {
    await expect(game.hostScene()).resolves.toBe(QuickDrawScene);
  });

  it("boots at 480×270 with integer scaling and renders one full round without errors", async () => {
    const run = await startScene(2, 1);
    const stage = phaser as Game;
    expect(stage.canvas.width).toBe(world.width);
    expect(stage.canvas.height).toBe(world.height);
    expect(stage.scale.zoom).toBe(zoom);
    expect(stage.canvas.style.width).toBe(`${world.width * zoom}px`);

    const phases: Phase[] = [];
    const seen = new Set<string>();
    let state = run.frame();
    while (state.round === 1 || state.phase !== "intro") {
      if (phases.at(-1) !== state.phase) phases.push(state.phase);
      for (const text of visibleTexts(run.scene)) seen.add(`${state.phase}:${text}`);
      state = run.frame();
      expect(run.scene.sys.isActive()).toBe(true);
    }

    expect(phases).toEqual(["intro", "standoff", "draw", "result"]);
    expect(seen).toContain("intro:Tap your phone when the TV shouts DRAW");
    expect(seen).toContain("standoff:Wait for it…");
    expect(seen).toContain("draw:DRAW!");
    expect(seen).toContain("result:BANG!");
    expect(seen).toContain("result:0.243");
    expect(seen).toContain("result:0.301");
    expect(seen).toContain("result:Player 1 wins the round");
    expect(run.cues.map((cue) => cue.type)).toEqual(["standoff", "draw", "result", "round"]);
    expect(problems).toEqual([]);

    // It really drew the world: sky above the horizon, sand on the street.
    expect(await readPixel(stage, 4, 40)).toBe(toPhaserColor(color.sky));
    expect(await readPixel(stage, 4, 120)).toBe(
      toPhaserColor(getScenePalette("desert").colors[0] as Hex),
    );
  });

  it(
    "plays a whole 8-player match with every fake-out, fouls and the match end",
    { timeout: 120_000 },
    async () => {
      const seed = seedWithEveryFake(8, rotatingBots);
      const run = await startScene(8, seed, rotatingBots);
      const seen = new Set<string>();
      let state = run.frame();
      for (let i = 0; i < 60 * 60 * 3 && state.phase !== "over"; i++) {
        for (const text of visibleTexts(run.scene)) seen.add(text);
        state = run.frame();
      }
      run.frame();

      expect(state.phase).toBe("over");
      const fakes = run.cues.filter((cue) => cue.type === "fake");
      const words = fakes.flatMap((cue) => (cue.type === "fake" && cue.word ? [cue.word] : []));
      expect(new Set(fakes.map((cue) => cue.type === "fake" && cue.kind))).toEqual(
        new Set(["word", "crow", "glint"]),
      );
      expect(state.round).toBe(9);
      for (const word of words) expect(seen).toContain(word);
      expect(seen).toContain("FOUL!");
      expect(seen).toContain("-.---");
      expect(seen).toContain("Only DRAW! counts");
      expect(run.cues.at(-1)).toEqual({ type: "over" });
      expect(problems).toEqual([]);
    },
  );

  it("keeps DRAW! at full size and the camera still with reduced motion", async () => {
    const run = await startScene(2, 1, mixedBots, { reducedMotion: true });
    let state = run.frame();
    const scales: number[] = [];
    while (state.phase !== "result") {
      const draw = run.scene.children.list.find(
        (child): child is GameObjects.Text =>
          child instanceof GameObjects.Text && child.text === "DRAW!",
      );
      if (draw?.visible) scales.push(draw.scaleX);
      expect(run.scene.cameras.main.shakeEffect.isRunning).toBe(false);
      state = run.frame();
    }
    expect(scales.length).toBeGreaterThan(1);
    expect(new Set(scales)).toEqual(new Set([1]));
    expect(problems).toEqual([]);
  });
});
