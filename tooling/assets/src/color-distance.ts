import type { Hex } from "@couchcade/theme";

/** An 8-bit RGB triple, no alpha. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX = /^#([0-9A-F]{6})$/i;

/** `#1E2A4A` -> `{ r: 30, g: 42, b: 74 }`. Throws on anything but `#RRGGBB`. */
export function hexToRgb(hex: string): Rgb {
  const match = HEX.exec(hex);
  if (!match) throw new TypeError(`Not a #RRGGBB colour: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

const toByteHex = (n: number): string => n.toString(16).padStart(2, "0");

/** `{ r: 30, g: 42, b: 74 }` -> `#1E2A4A`, upper case. */
export function rgbToHex({ r, g, b }: Rgb): Hex {
  return `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`.toUpperCase() as Hex;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * A colour in OKLab space (Björn Ottosson, https://bottosson.github.io/posts/oklab/): a perceptual
 * space where Euclidean distance tracks how different two colours look. Used instead of raw sRGB
 * distance so "nearest colour" picks what a person would call the closest match.
 */
export interface Oklab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

/** Converts sRGB (0-255 per channel) to OKLab. */
export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  // l, m, s are the LMS cone responses; lRoot etc. are their cube roots (OKLab's "l'/m'/s'").
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

/** Perceptual distance between two OKLab colours: plain Euclidean distance in that space. */
export function oklabDistance(a: Oklab, b: Oklab): number {
  const dl = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** A palette entry pre-converted to OKLab, so a whole sprite is only converted to OKLab once. */
export interface PaletteEntry {
  readonly hex: Hex;
  readonly rgb: Rgb;
  readonly oklab: Oklab;
}

/** Builds the lookup table `nearestPaletteColor` needs, once per palette. */
export function toPaletteEntries(colors: readonly Hex[]): readonly PaletteEntry[] {
  return colors.map((hex) => {
    const rgb = hexToRgb(hex);
    return { hex, rgb, oklab: rgbToOklab(rgb) };
  });
}

/** The palette entry perceptually closest to `rgb`, by OKLab distance. `palette` must not be empty. */
export function nearestPaletteColor(rgb: Rgb, palette: readonly PaletteEntry[]): PaletteEntry {
  if (palette.length === 0) throw new RangeError("nearestPaletteColor: palette is empty");
  const target = rgbToOklab(rgb);
  let closest = palette[0]!;
  let closestDistance = oklabDistance(target, closest.oklab);
  for (let i = 1; i < palette.length; i++) {
    const candidate = palette[i]!;
    const distance = oklabDistance(target, candidate.oklab);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}
