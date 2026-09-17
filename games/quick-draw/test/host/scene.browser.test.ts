import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { color, motion, toPhaserColor, typeScale, world } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { tickMs } from "@couchcade/game-sdk/contract";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { Callout, RoomCodePanel, Scoreboard, StageScene, safeArea } from "@couchcade/stage";
import { AUTO, Game, GameObjects, Scenes } from "phaser";
import type { Display, Scene } from "phaser";
import { getScenePalette } from "@couchcade/theme/scenes";
import game from "../../src/index.ts";
import { quickDrawCueEvent } from "../../src/host/cues.ts";
import type { QuickDrawCue } from "../../src/host/cues.ts";
import { pipSlots } from "../../src/host/layout.ts";
import { overlaps } from "../../src/host/label-layout.ts";
import type { Box } from "../../src/host/label-layout.ts";
import { InstructionPanel, PipTag, instructionPanelRect } from "../../src/host/overlays.ts";
import QuickDrawScene from "../../src/host/scene.ts";
import { sprites } from "../../src/host/sprites.ts";
import { worldPipLook } from "../../src/host/world-pip.ts";
import type { Phase, QuickDrawState } from "../../src/shared/index.ts";
import { botRoom, mixedBots, rotatingBots, seedWithEveryFake } from "./bots.ts";
import type { BotPlan } from "./bots.ts";

/**
 * Boots the scene the way the host stage does (apps/host/src/stage/boot.ts and runtime/stage.ts):
 * a canvas with nearest-neighbour pixels and the house style fonts loaded, the scene added under
 * the game id with `HostSceneData`. The stage draws the 480×270 world at a whole-number zoom and
 * the overlays at the canvas resolution. The test drives Phaser by hand, one game tick per frame.
 * CI renders with a software GPU, so only the output resolution test pays for a 1080p canvas; the
 * long runs use smaller canvases, which the stage fits the same way.
 */

const tv = { width: 1920, height: 1080 } as const;
/** Canvas pixels per world pixel on a 1080p TV. */
const zoom = 4;
/** A 960×540 canvas: the world at ×2. */
const halfTv = { width: tv.width / 2, height: tv.height / 2 } as const;
const desert = getScenePalette("desert").colors;
let phaser: Game | null = null;
let problems: unknown[] = [];

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

async function bootStage(canvas: { width: number; height: number }): Promise<Game> {
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
  options: {
    reducedMotion?: boolean;
    canvas?: { width: number; height: number };
    room?: boolean;
  } = {},
): Promise<Run> {
  const stage = await bootStage(options.canvas ?? world);
  phaser = stage;
  const bots = botRoom(players, seed, plan);
  const data: HostSceneData<QuickDrawState> = {
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

/**
 * Round n is won by seat n - 1 (modulo the players). The next seat fouls and the one after never
 * taps, so time, FOUL! and -.--- tags all stand next to the winner.
 */
const eachSeatWins =
  (players: number): BotPlan =>
  (round, slot) => {
    const winner = (round - 1) % players;
    if (slot === winner) return 200;
    if (players > 2 && slot === (winner + 1) % players) return -400;
    if (players > 3 && slot === (winner + 2) % players) return null;
    return 300 + slot * 10;
  };

/** A text's bounds on the overlay, as a box. */
function overlayBox(text: GameObjects.Text): Box {
  const rect = text.getBounds();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
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

/** The RGBA pixels of a canvas area, read back after the next frame. */
function readArea(stage: Game, area: { x: number; y: number; width: number; height: number }) {
  return new Promise<Uint8ClampedArray>((resolve) => {
    stage.renderer.snapshotArea(area.x, area.y, area.width, area.height, (snapshot) => {
      const image = snapshot as HTMLImageElement;
      const read = () => {
        const canvas = document.createElement("canvas");
        canvas.width = area.width;
        canvas.height = area.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("No 2D context");
        context.drawImage(image, 0, 0);
        resolve(context.getImageData(0, 0, area.width, area.height).data);
      };
      if (image.complete) read();
      else image.addEventListener("load", read, { once: true });
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

  it("renders the 480×270 world at a whole-number zoom and one full round without errors", async () => {
    const run = await startScene(2, 1, mixedBots, { canvas: halfTv });
    const stage = phaser as Game;
    const zoom = 2;
    expect([stage.canvas.width, stage.canvas.height]).toEqual([halfTv.width, halfTv.height]);
    expect(run.scene.cameras.main.zoom).toBe(zoom);
    expect(run.scene.viewport).toMatchObject({ x: 0, y: 0, width: world.width * zoom });

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
    const panel = run.scene.overlay.list.find(
      (child): child is InstructionPanel => child instanceof InstructionPanel,
    );
    expect(panel).toBeInstanceOf(InstructionPanel);
    // The room code panel sits in the bottom-right corner, clear of the instruction panel.
    const roomCode = run.scene.overlay.list.find(
      (child): child is RoomCodePanel => child instanceof RoomCodePanel,
    );
    if (!panel || !roomCode) throw new Error("expected the instruction and room code panels");
    expect([roomCode.code, roomCode.url]).toEqual(["BEAN", "couchcade.workers.dev"]);
    expect(roomCode.panelBounds.x + roomCode.panelBounds.width).toBe(safeArea.right);
    expect(roomCode.panelBounds.y).toBe(panel.rect.y);
    expect(panel.rect.x + panel.rect.width).toBeLessThan(roomCode.panelBounds.x);
    let framesWithoutRoomCode = 0;

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
      if (!shown(run.scene).includes(roomCode)) framesWithoutRoomCode += 1;
      state = run.frame();
      expect(run.scene.sys.isActive()).toBe(true);
    }
    // It is on screen during the whole game.
    expect(framesWithoutRoomCode).toBe(0);

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
    await expectPixel(stage, 4 * zoom, 40 * zoom, color.sky);
    await expectPixel(stage, 4 * zoom, 120 * zoom, desert[0] as Hex);
    await expectPixel(stage, 4 * zoom, 140 * zoom, desert[1] as Hex);
    const [slot] = pipSlots(2);
    const player = run.scene.hostData?.players[0];
    if (!slot || !player) throw new Error("expected a Pip slot and a player");
    const jersey = worldPipLook(player.slot ?? 0, player.profile).jersey;
    await expectPixel(stage, (slot.x - 8 + 4) * zoom, (slot.feetY - 3) * zoom, jersey);
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

  it(
    "draws the overlay text at the 1920×1080 output resolution, not scaled up from the world",
    { timeout: 90_000 },
    async () => {
      const run = await startScene(4, 1, mixedBots, { canvas: tv });
      const stage = phaser as Game;
      const overlayCamera = run.scene.overlayCamera;
      if (!overlayCamera) throw new Error("expected the overlay camera");
      let state = run.frame();
      while (!(state.phase === "result" && state.nowMs - state.phaseAtMs > 500))
        state = run.frame();

      // One overlay pixel is one canvas pixel, and glyphs rasterise at that resolution.
      expect(overlayCamera.zoom).toBe(1);
      const texts = shown(run.scene).filter(
        (child): child is GameObjects.Text =>
          child instanceof GameObjects.Text && child.text !== "",
      );
      expect(texts.map((text) => text.text)).toEqual(
        expect.arrayContaining([
          "Player 1 wins the round",
          "0.243",
          "0.301",
          "FOUL!",
          "-.---",
          "BANG!",
        ]),
      );
      const drawn = texts.map((text) => {
        let root: GameObjects.GameObject = text;
        while (root.parentContainer) root = root.parentContainer;
        const matrix = text.getWorldTransformMatrix();
        return {
          text: text.text,
          onOverlayCamera: text.willRender(overlayCamera),
          onWorldCamera: root.willRender(run.scene.cameras.main),
          resolution: [text.style.resolution, text.frame.source.resolution],
          // Canvas pixels per text pixel, rotated tags included. A callout may still be scaling.
          scale: text instanceof Callout ? 1 : Math.hypot(matrix.a, matrix.b) * overlayCamera.zoom,
          // Nothing on the TV is smaller than 24px at 1080p (HOUSE_STYLE "Readable from the couch").
          readable: Number.parseFloat(String(text.style.fontSize)) >= typeScale.small.tv,
        };
      });
      expect(drawn).toEqual(
        texts.map((text) => ({
          text: text.text,
          onOverlayCamera: true,
          onWorldCamera: false,
          resolution: [1, 1],
          scale: expect.closeTo(1, 6),
          readable: true,
        })),
      );

      // The instruction line, read back from the canvas: glyph edges fall on single canvas pixels.
      // Text drawn in the 480×270 world and scaled ×4 would fill every 4×4 block evenly.
      const line = texts.find((text) => text.text === "Player 1 wins the round");
      if (!line) throw new Error("expected the instruction line");
      const bounds = line.getBounds();
      const area = {
        x: Math.floor(bounds.x / zoom) * zoom,
        y: Math.floor(bounds.y / zoom) * zoom,
        width: Math.ceil(bounds.width / zoom) * zoom,
        height: Math.ceil(bounds.height / zoom) * zoom,
      };
      expect(area.y).toBeGreaterThanOrEqual(instructionPanelRect().y);
      const pixels = await readArea(stage, area);
      const dark = (x: number, y: number) => {
        const i = (y * area.width + x) * 4;
        return (pixels[i] ?? 255) + (pixels[i + 1] ?? 255) + (pixels[i + 2] ?? 255) < 3 * 128;
      };
      let inked = 0;
      let mixed = 0;
      let top = area.height;
      let bottom = 0;
      for (let by = 0; by < area.height; by += zoom) {
        for (let bx = 0; bx < area.width; bx += zoom) {
          let count = 0;
          for (let y = by; y < by + zoom; y++) {
            for (let x = bx; x < bx + zoom; x++) {
              if (!dark(x, y)) continue;
              count += 1;
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
          if (count > 0) inked += 1;
          if (count > 0 && count < zoom * zoom) mixed += 1;
        }
      }
      expect(inked).toBeGreaterThan(100);
      expect(mixed / inked).toBeGreaterThan(0.5);
      // Cap height to descender of 32px Fredoka, in canvas pixels.
      expect(bottom - top).toBeGreaterThanOrEqual(20);
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

  it("starts without a room code panel when the host gives no room code", async () => {
    const run = await startScene(2, 1, mixedBots, { room: false });
    run.frame();
    expect(run.scene.overlay.list.some((child) => child instanceof RoomCodePanel)).toBe(false);
    const panel = run.scene.overlay.list.find((child) => child instanceof InstructionPanel);
    expect((panel as InstructionPanel).rect).toEqual(instructionPanelRect());
    expect(problems).toEqual([]);
  });

  it(
    "never lets a tag cover a winner's BANG! or another tag, for every winning seat with 2 to 8 players",
    { timeout: 120_000 },
    async () => {
      // A world-sized canvas is enough: overlays are laid out in overlay pixels at any canvas size.
      const stage = await bootStage(world);
      phaser = stage;
      const checked: string[] = [];
      const clashes: string[] = [];
      let time = 0;
      const render = (): void => {
        time += tickMs;
        stage.step(time, tickMs);
      };

      for (let players = 2; players <= 8; players++) {
        const bots = botRoom(players, 1, eachSeatWins(players));
        const data: HostSceneData<QuickDrawState> = {
          getState: () => bots.room.state,
          players: bots.room.players,
          displayLagMs: 0,
          reducedMotion: false,
          roomCode: "BEAN",
          joinUrl: "https://couchcade.workers.dev/?room=BEAN",
        };
        if (stage.scene.getScene(game.id)) stage.scene.remove(game.id);
        stage.scene.add(game.id, QuickDrawScene, true, data as unknown as object);
        await vi.waitFor(
          () => {
            render();
            if (stage.scene.getScene(game.id)?.sys.settings.status !== Scenes.RUNNING) {
              throw new Error("Not running yet");
            }
          },
          { timeout: 10_000, interval: 5 },
        );
        const scene = stage.scene.getScene(game.id) as QuickDrawScene;

        let state = bots.room.state;
        let lastRound = 0;
        while (!bots.room.over) {
          state = bots.step();
          // Once BANG! is fully out: the tags never move after that in a round.
          const settled = state.phase === "result" && state.nowMs - state.phaseAtMs > motion.ui.ms;
          if (!settled || state.round === lastRound) continue;
          lastRound = state.round;
          render();

          const overlays = shown(scene);
          const bangs = overlays
            .filter(
              (child): child is GameObjects.Text =>
                child instanceof GameObjects.Text && child.text === "BANG!",
            )
            .map(overlayBox);
          // A tag's box is its pill and shadow; the text Phaser measured must sit inside it.
          const tags = overlays
            .filter((child): child is PipTag => child instanceof PipTag)
            .flatMap((tag) => {
              const text = tag.list.find((child) => child instanceof GameObjects.Text);
              return tag.box && tag.text && text instanceof GameObjects.Text
                ? [{ text: tag.text, box: tag.box, glyphs: overlayBox(text) }]
                : [];
            });
          const where = `${players} players, round ${state.round}`;
          for (const { text, box, glyphs } of tags) {
            const inside =
              glyphs.left >= box.left &&
              glyphs.right <= box.right &&
              glyphs.top >= box.top &&
              glyphs.bottom <= box.bottom;
            if (!inside) clashes.push(`${where}: ${text} text sticks out of its tag`);
          }
          if (bangs.length !== state.winners.length || bangs.length === 0 || tags.length < 2) {
            clashes.push(`${where}: ${bangs.length} BANG! and ${tags.length} tags`);
          }
          for (const [i, tag] of tags.entries()) {
            for (const bang of bangs) {
              if (overlaps(tag.box, bang)) clashes.push(`${where}: ${tag.text} covers BANG!`);
            }
            for (const other of tags.slice(i + 1)) {
              if (overlaps(tag.box, other.box)) {
                clashes.push(`${where}: ${tag.text} covers ${other.text}`);
              }
            }
          }
          checked.push(`${players}:${(state.round - 1) % players}`);
        }
      }

      // Every seat won a round, for every player count.
      const expected = Array.from({ length: 7 }, (_, index) => index + 2).flatMap((players) =>
        Array.from({ length: players }, (_, seat) => `${players}:${seat}`),
      );
      expect(new Set(checked)).toEqual(new Set(expected));
      expect(clashes).toEqual([]);
      expect(problems).toEqual([]);
    },
  );
});
