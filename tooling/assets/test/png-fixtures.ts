import { PNG } from "pngjs";

export type Rgba = readonly [r: number, g: number, b: number, a: number];
export type PixelFn = (x: number, y: number) => Rgba;

/**
 * Builds a small PNG in memory with pngjs, so tests never check in binary fixture files: every
 * sprite a test needs is generated from a handful of pixel values right where it's used.
 */
export function makePng(width: number, height: number, pixel: PixelFn): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (width * y + x) << 2;
      const [r, g, b, a] = pixel(x, y);
      png.data[offset] = r;
      png.data[offset + 1] = g;
      png.data[offset + 2] = b;
      png.data[offset + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

/** A uniform PNG filled with one RGBA colour. */
export function solidPng(width: number, height: number, rgba: Rgba): Buffer {
  return makePng(width, height, () => rgba);
}
