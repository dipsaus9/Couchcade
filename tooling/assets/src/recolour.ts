import { readFile, writeFile } from "node:fs/promises";
import type { PaletteEntry } from "./color-distance.ts";
import { nearestPaletteColor, toPaletteEntries } from "./color-distance.ts";
import { decodePng, encodePng, pixelOffset } from "./png.ts";
import type { DecodedPng } from "./png.ts";
import { loadScenePalette } from "./scene-loader.ts";
import type { LoadedScenePalette } from "./scene-loader.ts";

export interface RecolouredPixels {
  readonly image: DecodedPng;
  readonly totalPixels: number;
  /** Non-transparent pixels whose colour changed. Fully transparent pixels are never counted. */
  readonly changedPixels: number;
}

export interface RecolourResult extends RecolouredPixels {
  readonly scene: LoadedScenePalette;
}

/**
 * Maps every pixel to the nearest colour in `palette` (core colours + a scene palette), by OKLab
 * perceptual distance. A fully transparent pixel (alpha 0) is left exactly as it is: there is no
 * colour to recolour, and forcing one would draw a ring of stray colour around every sprite once
 * it's composited. Every other pixel keeps its own alpha untouched; only its RGB is remapped, so a
 * half-transparent edge pixel stays half-transparent.
 */
export function recolourPixels(
  image: DecodedPng,
  palette: readonly PaletteEntry[],
): RecolouredPixels {
  const data = Buffer.from(image.data);
  const totalPixels = image.width * image.height;
  let changedPixels = 0;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = pixelOffset(image.width, x, y);
      const alpha = data[offset + 3]!;
      if (alpha === 0) continue;

      const rgb = { r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]! };
      const nearest = nearestPaletteColor(rgb, palette);
      if (nearest.rgb.r !== rgb.r || nearest.rgb.g !== rgb.g || nearest.rgb.b !== rgb.b) {
        changedPixels++;
      }
      data[offset] = nearest.rgb.r;
      data[offset + 1] = nearest.rgb.g;
      data[offset + 2] = nearest.rgb.b;
      // Alpha (data[offset + 3]) is left untouched.
    }
  }

  return { image: { width: image.width, height: image.height, data }, changedPixels, totalPixels };
}

/**
 * `pnpm assets:recolour <input> <scene>`: recolours a CC0 sprite onto the core + `<scene>` palette
 * and overwrites `inputPath` in place, so the file at that path becomes the on-palette sprite the
 * game ships. Returns a summary for the CLI to print.
 */
export async function recolourFile(
  inputPath: string,
  sceneId: string,
  repoRoot: string,
): Promise<RecolourResult> {
  const scene = await loadScenePalette(sceneId, repoRoot);
  const palette = toPaletteEntries(scene.world);

  const source = decodePng(await readFile(inputPath));
  const recoloured = recolourPixels(source, palette);
  await writeFile(inputPath, encodePng(recoloured.image));

  return { ...recoloured, scene };
}
