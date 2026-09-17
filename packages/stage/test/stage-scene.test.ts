import { color, toPhaserColor, world } from "@couchcade/theme";
import { GameObjects } from "phaser";
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
import { boot, expectedColour, hex, hostData, pixel } from "./boot.ts";

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
