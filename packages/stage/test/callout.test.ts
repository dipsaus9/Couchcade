import { color, font, motion, world } from "@couchcade/theme";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { Callout, calloutStyle } from "../src/callout/index.ts";
import { StageScene } from "../src/scene/index.ts";
import { boot, countColour, hostData } from "./boot.ts";

describe("Callout", () => {
  it("uses the house style callout treatment", async () => {
    const { scene } = await boot(StageScene);
    const callout = scene.addCallout("Draw!");
    expect(callout).toBeInstanceOf(Callout);
    expect(scene.overlay.list).toContain(callout);
    expect(callout.text).toBe("DRAW!");
    expect(callout.angle).toBe(-4);
    expect(callout.style.color).toBe(color.sunny);
    expect(callout.style.stroke).toBe(color.ink);
    expect(callout.style.strokeThickness).toBe(calloutStyle.strokeThickness);
    expect(callout.style.fontFamily).toBe(font.pixel);
    expect(callout.style.fontSize).toBe("40px"); // 160px on the TV
    expect(callout.style.shadowOffsetX).toBe(0);
    expect(callout.style.shadowOffsetY).toBe(calloutStyle.shadowOffset);
    expect(callout.style.shadowColor).toBe(color.ink);
    expect(callout.style.shadowBlur).toBe(0);
    expect([callout.x, callout.y]).toEqual([world.width / 2, world.height / 2]);
  });

  it("pops in with the celebrate motion and a screen shake, and renders Sunny and Ink", async () => {
    const { game, scene } = await boot(StageScene);
    const callout = scene.addCallout("Strike!");
    expect(callout.reducedMotion).toBe(false);
    expect(callout.scale).toBeLessThan(1);
    expect(scene.cameras.main.shakeEffect.isRunning).toBe(true);
    expect(callout.entranceMs).toBe(motion.celebrate.ms);

    await vi.waitFor(() => expect(callout.scale).toBe(1), { timeout: 3_000 });
    await vi.waitFor(() => expect(scene.cameras.main.shakeEffect.isRunning).toBe(false), {
      timeout: 3_000,
    });
    const box = { x: 140, y: 105, width: 200, height: 60 };
    expect(await countColour(game, box, color.sunny)).toBeGreaterThan(100);
    expect(await countColour(game, box, color.ink)).toBeGreaterThan(100);
  });

  it("fades in without scaling or shaking with reduced motion", async () => {
    const { scene } = await boot(StageScene, hostData({ reducedMotion: true }));
    const callout = scene.addCallout("Foul!");
    expect(callout.reducedMotion).toBe(true);
    expect(callout.entranceMs).toBe(motion.ui.ms);
    expect(callout.alpha).toBe(0);

    const scales: number[] = [];
    const sample = () => scales.push(callout.scale);
    scene.events.on("postupdate", sample);
    await vi.waitFor(() => expect(callout.alpha).toBe(1), { timeout: 3_000 });
    scene.events.off("postupdate", sample);

    expect(scales.length).toBeGreaterThan(0);
    expect(new Set(scales)).toEqual(new Set([1]));
    expect(scene.cameras.main.shakeEffect.isRunning).toBe(false);
  });

  it("dismisses itself after holdMs", async () => {
    const { scene } = await boot(StageScene, hostData({ reducedMotion: true }));
    const callout = scene.addCallout("Tap!", { holdMs: 50 });
    await vi.waitFor(() => expect(callout.scene).toBeFalsy(), { timeout: 3_000 });
    expect(scene.overlay.list).not.toContain(callout);
  });
});
