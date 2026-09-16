/**
 * Upstream font sources: the official google/fonts mirror of each font's OFL release
 * (https://github.com/google/fonts/tree/main/ofl/fredoka,
 * https://github.com/google/fonts/tree/main/ofl/pixelifysans). Both are "OFL, no reserved font
 * names" per METADATA.pb, so subsetting and self-hosting are unrestricted (docs/TECH_STACK.md,
 * "Fonts"). Pinned to one commit so re-running `pnpm fonts:subset` is reproducible instead of
 * tracking a moving `main` branch.
 */
const PIN = "92345ac0dbb28d27dbd32f3a782e84c55eaac214";

const rawUrl = (path: string): string =>
  `https://raw.githubusercontent.com/google/fonts/${PIN}/${path}`;

export interface FontSource {
  /** Directory name under packages/theme/fonts/. */
  readonly id: string;
  /** Family name written into the @font-face rule (packages/theme/src/generate/fonts.ts). */
  readonly family: string;
  /** Upstream variable TTF. */
  readonly ttfUrl: string;
  /** Upstream OFL.txt, copied next to the subsetted WOFF2 unmodified (AC2). */
  readonly oflUrl: string;
  /** Output WOFF2 filename inside packages/theme/fonts/<id>/. */
  readonly outputFile: string;
}

export const FONT_SOURCES: readonly FontSource[] = [
  {
    id: "fredoka",
    family: "Fredoka",
    ttfUrl: rawUrl("ofl/fredoka/Fredoka%5Bwdth%2Cwght%5D.ttf"),
    oflUrl: rawUrl("ofl/fredoka/OFL.txt"),
    outputFile: "fredoka.woff2",
  },
  {
    id: "pixelify-sans",
    family: "Pixelify Sans",
    ttfUrl: rawUrl("ofl/pixelifysans/PixelifySans%5Bwght%5D.ttf"),
    oflUrl: rawUrl("ofl/pixelifysans/OFL.txt"),
    outputFile: "pixelify-sans.woff2",
  },
];
