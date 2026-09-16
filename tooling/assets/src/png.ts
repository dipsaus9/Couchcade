import { PNG } from "pngjs";

/** A decoded PNG: RGBA bytes, 4 per pixel, row-major from the top-left corner. */
export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
}

/** Reads a PNG file's bytes into RGBA pixel data. Pure JS (pngjs): no native build. */
export function decodePng(buffer: Buffer): DecodedPng {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

/** Encodes RGBA pixel data back into PNG file bytes. */
export function encodePng(image: DecodedPng): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  image.data.copy(png.data);
  return PNG.sync.write(png);
}

/** The byte offset of pixel `(x, y)` in a `DecodedPng`'s `data`. */
export function pixelOffset(width: number, x: number, y: number): number {
  return (width * y + x) << 2;
}
