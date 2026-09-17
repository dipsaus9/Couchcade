import { color, toPhaserColor, world } from "@couchcade/theme";
import { GameObjects } from "phaser";
import type { Game } from "phaser";
import { describe, expect, it } from "vitest";
import {
  OVERLAY_DEPTH,
  metrics,
  overlayFrame,
  stageViewport,
  worldToOverlay,
} from "../src/layout/index.ts";
import { RoomCodePanel } from "../src/room-code/index.ts";
import { StageScene } from "../src/scene/index.ts";
import { boot, expectedColour, hex, hostData, pixel, player, readArea } from "./boot.ts";

/** A game scene that adds the room code first and then covers the whole world in Turf. */
class CoveredWorldScene extends StageScene {
  create() {
    this.addRoomCode({ code: "BEAN", url: "couchcade.workers.dev" });
    this.add
      .rectangle(0, 0, world.width, world.height, toPhaserColor(color.turf))
      .setOrigin(0)
      .setDepth(10);
  }
}

/** A world of one Turf pixel at (10, 20), with overlay text on top. */
class PixelWorldScene extends StageScene {
  create() {
    this.add.rectangle(10, 20, 1, 1, toPhaserColor(color.turf)).setOrigin(0);
    this.overlay.add(this.add.text(100, 100, "Readable", { fontSize: "32px" }));
  }
}

describe("stageViewport", () => {
  it.each([
    [1920, 1080, 4, 0, 0],
    [3840, 2160, 8, 0, 0],
    [1280, 720, 2, 160, 90],
    [2560, 1440, 5, 80, 45],
    [3024, 1890, 6, 72, 135],
    [480, 270, 1, 0, 0],
    [300, 200, 1, -90, -35],
  ])("fits the world into %i×%i at ×%i, offset %i,%i", (width, height, zoom, x, y) => {
    const viewport = stageViewport(width, height);
    expect(viewport).toEqual({
      x,
      y,
      width: world.width * zoom,
      height: world.height * zoom,
      worldZoom: zoom,
      overlayZoom: zoom / 4,
    });
  });

  it("maps world pixels to overlay pixels at ×4", () => {
    expect(worldToOverlay(world.width)).toBe(overlayFrame.width);
    expect(worldToOverlay(world.height)).toBe(overlayFrame.height);
  });
});

describe("StageScene", () => {
  it("draws the overlay layer above the game world", async () => {
    const { game, scene } = await boot(CoveredWorldScene);
    const panel = scene.overlay.list[0];
    expect(panel).toBeInstanceOf(RoomCodePanel);
    expect(scene.overlay.depth).toBe(OVERLAY_DEPTH);

    const { x, y, height } = (panel as RoomCodePanel).panelBounds;
    // Inside the panel: Chalk, although the world was drawn later and covers the screen.
    expect(hex(await pixel(game, x + metrics.outline + 3, y + Math.floor(height / 2)))).toBe(
      expectedColour(color.chalk),
    );
    // Outside the overlays: the world.
    expect(hex(await pixel(game, 400, 600))).toBe(expectedColour(color.turf));
  });

  it("renders the world at whole-number zoom and the overlay at the canvas resolution", async () => {
    const { game, scene } = await boot(PixelWorldScene);
    const worldCamera = scene.cameras.main;
    const overlayCamera = scene.overlayCamera;
    if (!overlayCamera) throw new Error("expected an overlay camera");
    expect([game.canvas.width, game.canvas.height]).toEqual([1920, 1080]);
    expect(worldCamera.zoom).toBe(4);
    expect(overlayCamera.zoom).toBe(1);
    expect(overlayCamera.roundPixels).toBe(true);
    expect(scene.viewport).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 });

    // One world pixel covers a 4×4 block of canvas pixels, with nothing blended around it.
    expect(hex(await pixel(game, 40, 80))).toBe(expectedColour(color.turf));
    expect(hex(await pixel(game, 43, 83))).toBe(expectedColour(color.turf));
    expect(hex(await pixel(game, 39, 80))).toBe(expectedColour(color.sky));
    expect(hex(await pixel(game, 44, 83))).toBe(expectedColour(color.sky));

    // Each camera draws only its own objects.
    const [rectangle] = scene.children.list.filter((c) => c instanceof GameObjects.Rectangle);
    const text = scene.overlay.list[0] as GameObjects.Text;
    expect(rectangle?.willRender(worldCamera)).toBe(true);
    expect(rectangle?.willRender(overlayCamera)).toBe(false);
    expect(text.willRender(worldCamera)).toBe(false);
    expect(text.willRender(overlayCamera)).toBe(true);
    expect(text.style.resolution).toBe(1);
  });

  it("letterboxes an odd canvas in Sky and renders overlay text at 4K resolution", async () => {
    const { game, scene } = await boot(PixelWorldScene, undefined, { width: 3840, height: 2200 });
    expect(scene.cameras.main.zoom).toBe(8);
    expect(scene.overlayCamera?.zoom).toBe(2);
    expect(scene.viewport).toMatchObject({ x: 0, y: 20, width: 3840, height: 2160 });
    expect(hex(await pixel(game, 80, 20 + 160))).toBe(expectedColour(color.turf));
    expect(hex(await pixel(game, 80, 10))).toBe(expectedColour(color.sky));
    // Text glyphs are rasterised at the overlay zoom, not scaled up from 1080p.
    const text = scene.overlay.list[0] as GameObjects.Text;
    expect(text.style.resolution).toBe(2);
    expect(text.frame.source.resolution).toBe(2);
  });

  it("refits both cameras when the canvas is resized", async () => {
    const { game, scene } = await boot(PixelWorldScene);
    game.scale.resize(1280, 720);
    expect(scene.cameras.main.zoom).toBe(2);
    expect(scene.overlayCamera?.zoom).toBe(0.5);
    expect(scene.viewport).toMatchObject({ x: 160, y: 90, width: 960, height: 540 });
    expect(scene.cameras.main.x).toBe(160);
    expect(scene.overlayCamera?.y).toBe(90);
  });

  it("keeps one overlay layer per run of the scene", async () => {
    const { scene } = await boot(StageScene);
    expect(scene.overlay).toBe(scene.overlay);
    expect(scene.children.getAll().filter((child) => child === scene.overlay)).toHaveLength(1);
  });

  it("reads host scene data and the reduced motion setting", async () => {
    const data = hostData({ reducedMotion: true, displayLagMs: 42 });
    const { scene } = await boot(StageScene, data);
    expect(scene.hostData).toBe(data);
    expect(scene.reducedMotion).toBe(true);
  });

  it("defaults to full motion without host scene data", async () => {
    const { scene } = await boot(StageScene);
    expect(scene.hostData).toBeUndefined();
    expect(scene.reducedMotion).toBe(false);
  });
});

/** The players on the scoreboard in the text sharpness test. */
const sharpRoom = [player("ana", "Ana Lima", 0, 1), player("ben", "Benjamin", 1, 2)];

/**
 * Checks that overlay text lands 1:1 on canvas pixels: every pixel of the text's box on the canvas
 * equals the text's own texture drawn over Chalk at its snapped position. Text rasterised at another
 * size and resampled, or stretched by a pixel, fails this.
 */
async function expectSharpText(game: Game, scene: StageScene, text: GameObjects.Text) {
  const zoom = scene.overlayCamera?.zoom ?? 0;
  const { canvas } = text;
  const bounds = text.getBounds();
  const area = {
    x: Math.round(scene.viewport.x + bounds.x * zoom),
    y: Math.round(scene.viewport.y + bounds.y * zoom),
    width: canvas.width,
    height: canvas.height,
  };
  const drawn = await readArea(game, area);
  const glyphs = text.context.getImageData(0, 0, canvas.width, canvas.height).data;
  const chalk = toPhaserColor(color.chalk);
  const background = [(chalk >> 16) & 255, (chalk >> 8) & 255, chalk & 255];
  let inked = 0;
  let wrong = 0;
  for (let i = 0; i < glyphs.length; i += 4) {
    const alpha = (glyphs[i + 3] ?? 0) / 255;
    if (alpha > 0) inked += 1;
    for (let channel = 0; channel < 3; channel++) {
      const expected =
        (glyphs[i + channel] ?? 0) * alpha + (background[channel] ?? 0) * (1 - alpha);
      if (Math.abs((drawn[i + channel] ?? 0) - expected) > 8) {
        wrong += 1;
        break;
      }
    }
  }
  expect(inked, `${text.text} has glyphs`).toBeGreaterThan(100);
  expect(wrong / (glyphs.length / 4), `${text.text}: pixels off at ×${zoom}`).toBeLessThan(0.01);
  // Rasterised at the overlay zoom, in a texture of whole canvas pixels.
  expect(text.style.resolution).toBe(zoom);
  expect([canvas.width, canvas.height]).toEqual(
    [text.width * zoom, text.height * zoom].map(Math.round),
  );
}

describe("StageScene overlay text", () => {
  // A 1080p TV in a browser window (world ×3) and a HiDPI laptop (world ×6).
  it.each([
    [1440, 810, 0.75],
    [2880, 1620, 1.5],
  ])(
    "draws scoreboard names 1:1 on canvas pixels on a %i×%i canvas (overlay ×%f)",
    async (width, height, zoom) => {
      const { game, scene } = await boot(StageScene, undefined, { width, height });
      expect(scene.overlayCamera?.zoom).toBe(zoom);
      const scoreboard = scene.addScoreboard({ players: sharpRoom, scores: { ana: 2, ben: 10 } });
      // Let a frame run, so the stage has sized the text for the overlay zoom.
      await pixel(game, 0, 0);
      const texts = scoreboard.list.filter(
        (child): child is GameObjects.Text =>
          child instanceof GameObjects.Text && ["Ana Lima", "Benjamin"].includes(child.text),
      );
      expect(texts.map((text) => text.text)).toEqual(["Ana Lima", "Benjamin"]);
      for (const text of texts) {
        await expectSharpText(game, scene, text);
      }
    },
  );
});
