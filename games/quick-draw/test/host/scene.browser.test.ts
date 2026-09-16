import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { color, toPhaserColor, world } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { Callout, Scoreboard, StageScene } from "@couchcade/stage";
import { AUTO, Game, GameObjects, Scale, Scenes } from "phaser";
import type { Display, Scene } from "phaser";
import { getScenePalette } from "@couchcade/theme/scenes";
import game from "../../src/index.ts";
import { quickDrawCueEvent } from "../../src/host/cues.ts";
import type { QuickDrawCue } from "../../src/host/cues.ts";
import { pipSlots } from "../../src/host/layout.ts";
import { InstructionPanel } from "../../src/host/overlays.ts";
import QuickDrawScene from "../../src/host/scene.ts";
import { sprites } from "../../src/host/sprites.ts";
import { worldPipLook } from "../../src/host/world-pip.ts";
import type { Phase, QuickDrawState } from "../../src/shared/index.ts";
import { botRoom, mixedBots, rotatingBots, seedWithEveryFake } from "./bots.ts";
import type { BotPlan } from "./bots.ts";

/**
 * Boots the scene the way the host stage does (apps/host/src/stage/boot.ts and runtime/stage.ts):
 * a 480×270 world with nearest-neighbour pixels and a whole-number zoom, the scene added under
 * the game id with `HostSceneData`. The test drives Phaser by hand, one game tick per frame.
 */

const zoom = 2;
const desert = getScenePalette("desert").colors;
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
  scene: QuickDrawScene;
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
  // The scene loads its sprites before `create`: step frames until it runs.
  await vi.waitFor(
    () => {
      render();
      const scene = stage.scene.getScene(game.id);
      if (scene?.sys.settings.status !== Scenes.RUNNING) throw new Error("Not running yet");
    },
    { timeout: 10_000, interval: 5 },
  );
  const scene = stage.scene.getScene(game.id) as QuickDrawScene;

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

/** Visible text in the scene, the overlay layer included. */
function visibleTexts(scene: Scene): string[] {
  return shown(scene)
    .filter((child): child is GameObjects.Text => child instanceof GameObjects.Text)
    .filter((text) => text.text !== "")
    .map((text) => text.text);
}

/** Texture keys of the visible images, sprites and tile sprites. */
function visibleTextures(scene: Scene): string[] {
  return shown(scene).flatMap((child) =>
    child instanceof GameObjects.Image ||
    child instanceof GameObjects.Sprite ||
    child instanceof GameObjects.TileSprite
      ? [child.texture.key]
      : [],
  );
}

function drawCallout(scene: StageScene): Callout | undefined {
  return scene.overlay.list.find(
    (child): child is Callout => child instanceof Callout && child.text === "DRAW!",
  );
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

const hex = (value: number) => `#${value.toString(16).toUpperCase().padStart(6, "0")}`;
const expectPixel = async (stage: Game, x: number, y: number, expected: Hex) =>
  expect(hex(await readPixel(stage, x, y))).toBe(hex(toPhaserColor(expected)));

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
  it("loads through the game's hostScene loader and extends StageScene", async () => {
    await expect(game.hostScene()).resolves.toBe(QuickDrawScene);
    expect(QuickDrawScene.prototype).toBeInstanceOf(StageScene);
  });

  it("boots at 480×270 with integer scaling and renders one full round without errors", async () => {
    const run = await startScene(2, 1);
    const stage = phaser as Game;
    expect(stage.canvas.width).toBe(world.width);
    expect(stage.canvas.height).toBe(world.height);
    expect(stage.scale.zoom).toBe(zoom);
    expect(stage.canvas.style.width).toBe(`${world.width * zoom}px`);

    // Every sprite comes from games/quick-draw/assets.
    const missing = Object.values(sprites).filter((sprite) => !stage.textures.exists(sprite.key));
    expect(missing).toEqual([]);
    // The stage overlays: the scoreboard with a chip per player and the instruction panel.
    const scoreboard = run.scene.overlay.list.find((child) => child instanceof Scoreboard);
    expect(scoreboard).toBeInstanceOf(Scoreboard);
    expect((scoreboard as Scoreboard).chips.map((chip) => chip.name)).toEqual([
      "Player 1",
      "Player 2",
    ]);
    expect(run.scene.overlay.list.some((child) => child instanceof InstructionPanel)).toBe(true);

    const phases: Phase[] = [];
    const seen = new Set<string>();
    const textures = new Set<string>();
    let drawFirstFrame: { scale: number; alpha: number; shaking: boolean } | null = null;
    let shookAfterDraw = false;
    let state = run.frame();
    while (state.round === 1 || state.phase !== "intro") {
      if (phases.at(-1) !== state.phase) phases.push(state.phase);
      for (const text of visibleTexts(run.scene)) seen.add(`${state.phase}:${text}`);
      for (const key of visibleTextures(run.scene)) textures.add(`${state.phase}:${key}`);
      const draw = drawCallout(run.scene);
      if (draw && drawFirstFrame === null) {
        drawFirstFrame = {
          scale: draw.scale,
          alpha: draw.alpha,
          shaking: run.scene.cameras.main.shakeEffect.isRunning,
        };
      } else if (draw) {
        shookAfterDraw ||= run.scene.cameras.main.shakeEffect.isRunning;
      }
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
    expect(seen).toContain("result:Round");
    expect(seen).toContain("intro:1");
    expect(textures).toContain(`intro:${sprites.tumbleweed.key}`);
    expect(textures).toContain(`result:${sprites.dustPuff.key}`);
    expect(textures).toContain(`result:${sprites.popgun.key}`);
    // DRAW! is fully readable on its first frame; the pop and the shake play after it.
    expect(drawFirstFrame).not.toBeNull();
    expect(drawFirstFrame?.scale).toBeGreaterThanOrEqual(1);
    expect(drawFirstFrame?.alpha).toBe(1);
    expect(drawFirstFrame?.shaking).toBe(false);
    expect(shookAfterDraw).toBe(true);
    expect(run.cues.map((cue) => cue.type)).toEqual(["standoff", "draw", "result", "round"]);
    expect(problems).toEqual([]);

    // It really drew the world: sky above the mesas, sand on the roadside, the street tiles and
    // Player 1's World Pip in their seat colour.
    await expectPixel(stage, 4, 40, color.sky);
    await expectPixel(stage, 4, 120, desert[0] as Hex);
    await expectPixel(stage, 4, 140, desert[1] as Hex);
    const [slot] = pipSlots(2);
    const player = run.scene.hostData?.players[0];
    if (!slot || !player) throw new Error("expected a Pip slot and a player");
    const jersey = worldPipLook(player.slot ?? 0, player.profile).jersey;
    await expectPixel(stage, slot.x - 8 + 4, slot.feetY - 3, jersey);
  });

  it(
    "plays a whole 8-player match with every fake-out, fouls and the match end",
    { timeout: 120_000 },
    async () => {
      const seed = seedWithEveryFake(8, rotatingBots);
      const run = await startScene(8, seed, rotatingBots);
      const seen = new Set<string>();
      const textures = new Set<string>();
      let state = run.frame();
      for (let i = 0; i < 60 * 60 * 3 && state.phase !== "over"; i++) {
        for (const text of visibleTexts(run.scene)) seen.add(text);
        for (const key of visibleTextures(run.scene)) textures.add(key);
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
      expect(textures).toContain(sprites.crow.key);
      expect(textures).toContain(sprites.sparkle.key);
      expect(seen).toContain("FOUL!");
      expect(seen).toContain("-.---");
      expect(seen).toContain("Only DRAW! counts");
      expect(run.cues.at(-1)).toEqual({ type: "over" });
      expect(problems).toEqual([]);
    },
  );

  it("shows DRAW! at full size on every frame and keeps the camera still with reduced motion", async () => {
    const run = await startScene(2, 1, mixedBots, { reducedMotion: true });
    let state = run.frame();
    const draws: Array<{ scale: number; alpha: number }> = [];
    while (state.phase !== "result") {
      const draw = drawCallout(run.scene);
      if (draw) draws.push({ scale: draw.scale, alpha: draw.alpha });
      expect(run.scene.cameras.main.shakeEffect.isRunning).toBe(false);
      state = run.frame();
    }
    expect(draws.length).toBeGreaterThan(1);
    expect(new Set(draws.map((draw) => draw.scale))).toEqual(new Set([1]));
    expect(new Set(draws.map((draw) => draw.alpha))).toEqual(new Set([1]));
    expect(problems).toEqual([]);
  });
});
