import { color, toPhaserColor, world } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { OVERLAY_DEPTH } from "../src/layout/index.ts";
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

describe("StageScene", () => {
  it("draws the overlay layer above the game world", async () => {
    const { game, scene } = await boot(CoveredWorldScene);
    const panel = scene.overlay.list[0];
    expect(panel).toBeInstanceOf(RoomCodePanel);
    expect(scene.overlay.depth).toBe(OVERLAY_DEPTH);

    const { x, y, height } = (panel as RoomCodePanel).panelBounds;
    // Inside the panel: Chalk, although the world was drawn later and covers the screen.
    expect(hex(await pixel(game, x + 3, y + Math.floor(height / 2)))).toBe(
      expectedColour(color.chalk),
    );
    // Outside the overlays: the world.
    expect(hex(await pixel(game, 100, 150))).toBe(expectedColour(color.turf));
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
