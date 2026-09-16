import { color, font, world } from "@couchcade/theme";
import { GameObjects } from "phaser";
import { describe, expect, it } from "vitest";
import { metrics, safeArea } from "../src/layout/index.ts";
import { roomCodeMetrics } from "../src/room-code/index.ts";
import type { RoomCodePanel } from "../src/room-code/index.ts";
import { StageScene } from "../src/scene/index.ts";
import { boot, expectedColour, hex, pixel } from "./boot.ts";

function texts(panel: RoomCodePanel): GameObjects.Text[] {
  return panel.list.filter((child) => child instanceof GameObjects.Text);
}

describe("RoomCodePanel", () => {
  it("sits bottom-right on the edge of the 5% safe area", async () => {
    const { game, scene } = await boot(StageScene);
    const panel = scene.addRoomCode({ code: "BEAN", url: "couchcade.workers.dev" });
    expect(scene.overlay.list).toContain(panel);

    // 5% of 480×270, rounded inwards.
    expect(safeArea).toMatchObject({ left: 24, right: 456, top: 14, bottom: 256 });
    const { x, y, width, height } = panel.panelBounds;
    expect(x + width).toBe(safeArea.right);
    expect(y + height + metrics.depth).toBe(safeArea.bottom);
    expect(x).toBeGreaterThan(world.width / 2);
    expect([width, height]).toEqual([roomCodeMetrics.minWidth, roomCodeMetrics.height]);

    const midY = Math.floor(y + height / 2);
    expect(hex(await pixel(game, x + 2, midY))).toBe(expectedColour(color.chalk));
    expect(hex(await pixel(game, x + width - 1, midY))).toBe(expectedColour(color.ink));
    expect(hex(await pixel(game, x + 10, y + height + metrics.depth - 1))).toBe(
      expectedColour(color.ink),
    );
    // Just outside the safe area: nothing but the background.
    expect(hex(await pixel(game, safeArea.right, midY))).toBe(expectedColour(color.sky));
    expect(hex(await pixel(game, x + 10, safeArea.bottom))).toBe(expectedColour(color.sky));
  });

  it("shows the code in Pixelify Sans and the join URL in Fredoka, right-aligned", async () => {
    const { scene } = await boot(StageScene);
    const panel = scene.addRoomCode({ code: "BEAN", url: "couchcade.workers.dev" });
    const [code, url] = texts(panel);
    expect(code?.text).toBe("BEAN");
    expect(code?.style.fontFamily).toBe(font.pixel);
    expect(code?.style.fontSize).toBe("18px"); // 72px on the TV
    expect(url?.text).toBe("couchcade.workers.dev");
    expect(url?.style.fontFamily).toBe(font.ui);
    expect(url?.style.fontSize).toBe("6px"); // 24px on the TV
    const { x, y, width, height } = panel.panelBounds;
    for (const text of [code, url]) {
      const bounds = text!.getBounds();
      expect(bounds.right).toBe(x + width - roomCodeMetrics.padX);
      expect(bounds.left).toBeGreaterThanOrEqual(x + roomCodeMetrics.padX);
      expect(bounds.top).toBeGreaterThanOrEqual(y + metrics.outline);
      expect(bounds.bottom).toBeLessThanOrEqual(y + height - metrics.outline);
    }
    expect(url!.getBounds().top).toBeGreaterThan(code!.getBounds().top);
  });

  it("grows to the left for a long URL and follows a new code", async () => {
    const { scene } = await boot(StageScene);
    const panel = scene.addRoomCode({ code: "BEAN", url: "couchcade.workers.dev" });
    panel.setCode("DUCK", "a-much-longer-couchcade-preview.workers.dev");
    expect(panel.code).toBe("DUCK");
    const { x, width } = panel.panelBounds;
    expect(width).toBeGreaterThan(roomCodeMetrics.minWidth);
    expect(x + width).toBe(safeArea.right);
    expect(texts(panel)[0]?.text).toBe("DUCK");
  });
});
