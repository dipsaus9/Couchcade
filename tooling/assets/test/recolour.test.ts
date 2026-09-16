import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { toPaletteEntries } from "../src/color-distance.ts";
import { decodePng, pixelOffset } from "../src/png.ts";
import { recolourFile, recolourPixels } from "../src/recolour.ts";
import { repoRoot } from "../src/repo-root.ts";
import { loadScenePalette } from "../src/scene-loader.ts";
import { makePng } from "./png-fixtures.ts";

const palette = toPaletteEntries(["#000000", "#FFFFFF", "#FF0000"]);

describe("recolourPixels", () => {
  it("maps an off-palette pixel to its nearest palette colour", () => {
    const image = decodePng(makePng(1, 1, () => [200, 10, 10, 255]));
    const result = recolourPixels(image, palette);
    const offset = pixelOffset(1, 0, 0);
    expect([
      result.image.data[offset],
      result.image.data[offset + 1],
      result.image.data[offset + 2],
      result.image.data[offset + 3],
    ]).toEqual([255, 0, 0, 255]);
    expect(result.changedPixels).toBe(1);
    expect(result.totalPixels).toBe(1);
  });

  it("leaves an already on-palette pixel counted as unchanged", () => {
    const image = decodePng(makePng(1, 1, () => [0, 0, 0, 255]));
    const result = recolourPixels(image, palette);
    expect(result.changedPixels).toBe(0);
  });

  it("leaves a fully transparent pixel exactly as it is", () => {
    const image = decodePng(makePng(1, 1, () => [123, 45, 67, 0]));
    const result = recolourPixels(image, palette);
    const offset = pixelOffset(1, 0, 0);
    expect([
      result.image.data[offset],
      result.image.data[offset + 1],
      result.image.data[offset + 2],
      result.image.data[offset + 3],
    ]).toEqual([123, 45, 67, 0]);
    expect(result.changedPixels).toBe(0);
  });

  it("remaps colour but preserves a partially transparent pixel's alpha", () => {
    const image = decodePng(makePng(1, 1, () => [200, 10, 10, 128]));
    const result = recolourPixels(image, palette);
    const offset = pixelOffset(1, 0, 0);
    expect(result.image.data[offset]).toBe(255); // remapped to red
    expect(result.image.data[offset + 1]).toBe(0);
    expect(result.image.data[offset + 2]).toBe(0);
    expect(result.image.data[offset + 3]).toBe(128); // alpha untouched
  });
});

describe("recolourFile (real repo, desert scene)", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("overwrites the input file with every non-transparent pixel on-palette", async () => {
    dir = mkdtempSync(join(tmpdir(), "assets-recolour-"));
    const file = join(dir, "cactus.png");
    // 16x24 (on the world grid), one off-palette green plus one fully transparent corner pixel.
    await writeFile(
      file,
      makePng(16, 24, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 0] : [12, 250, 12, 255])),
    );

    const result = await recolourFile(file, "desert", repoRoot);
    expect(result.scene.id).toBe("desert");

    const scene = await loadScenePalette("desert", repoRoot);
    const allowed = new Set<string>(scene.world);

    const written = decodePng(await readFile(file));
    const cornerOffset = pixelOffset(written.width, 0, 0);
    expect(written.data[cornerOffset + 3]).toBe(0); // untouched, still fully transparent

    const otherPixels: { x: number; y: number }[] = [];
    for (let y = 0; y < written.height; y++) {
      for (let x = 0; x < written.width; x++) {
        if (x !== 0 || y !== 0) otherPixels.push({ x, y });
      }
    }
    for (const { x, y } of otherPixels) {
      const offset = pixelOffset(written.width, x, y);
      expect(written.data[offset + 3]).toBe(255);
      const hex = `#${[written.data[offset], written.data[offset + 1], written.data[offset + 2]]
        .map((n) => n!.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`;
      expect(allowed.has(hex)).toBe(true);
    }
  });
});
