import { PNG } from "pngjs";

export type Rgba = readonly [r: number, g: number, b: number, a: number];

/** A tiny in-memory PNG filled with one RGBA colour, for the sprite-check wiring test. */
export function solidPng(width: number, height: number, [r, g, b, a]: Rgba): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (width * y + x) << 2;
      png.data[offset] = r;
      png.data[offset + 1] = g;
      png.data[offset + 2] = b;
      png.data[offset + 3] = a;
    }
  }
  return PNG.sync.write(png);
}
