import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { toFontFaceCss } from "@couchcade/theme/generate";

/**
 * Neither `harfbuzzjs` nor `fontverter` ships TypeScript types (checked: no `@types/harfbuzzjs` or
 * `@types/fontverter` on npm), and `harfbuzzjs`'s CJS entry is `module.exports = new Promise(...)`
 * — a shape Vite/Vitest's ESM interop for CJS deps doesn't preserve (its `.then` throws "called on
 * incompatible receiver" once transformed). Both are already a `subset-font` dependency (CC-4.3's
 * WASM subsetter, `pnpm-workspace.yaml`'s "Fonts" catalog) — reused directly here, as
 * `packages/theme/package.json`'s own devDependencies, to read a committed WOFF2's cmap back for
 * CC-4.12 AC3. `createRequire` loads them the same way `subset-font`'s own `index.js` loads
 * harfbuzzjs internally: plain CJS `require`, sidestepping the ESM interop entirely.
 */
const require = createRequire(import.meta.url);

interface HarfbuzzFace {
  /** Every codepoint the face's cmap maps to a real glyph (never glyph 0, .notdef). */
  collectUnicodes(): Uint32Array;
  destroy(): void;
}
interface HarfbuzzBlob {
  destroy(): void;
}
interface Harfbuzz {
  createBlob(data: Uint8Array): HarfbuzzBlob;
  createFace(blob: HarfbuzzBlob, index: number): HarfbuzzFace;
}
interface Fontverter {
  convert(buffer: Uint8Array, toFormat: string, fromFormat?: string): Promise<Buffer>;
}

const harfbuzzReady: Promise<Harfbuzz> = require("harfbuzzjs");
const fontverter: Fontverter = require("fontverter");

const FONTS_DIR = join(import.meta.dirname, "../fonts");

/** Loads a committed WOFF2's cmap as a set of covered Unicode codepoints (CC-4.12 AC3). */
async function coveredCodepoints(woff2Path: string): Promise<Set<number>> {
  const woff2 = readFileSync(woff2Path);
  const sfnt = await fontverter.convert(woff2, "truetype");
  const hb = await harfbuzzReady;
  const blob = hb.createBlob(sfnt);
  const face = hb.createFace(blob, 0);
  const covered = new Set(face.collectUnicodes());
  face.destroy();
  blob.destroy();
  return covered;
}

describe("toFontFaceCss", () => {
  it("declares both house-style fonts with font-display: swap", () => {
    const css = toFontFaceCss();
    expect(css).toContain('font-family: "Fredoka"');
    expect(css).toContain('font-family: "Pixelify Sans"');
    expect(css.match(/font-display: swap;/g)).toHaveLength(2);
  });

  it("only ever points at same-origin absolute paths, never a font CDN", () => {
    const css = toFontFaceCss();
    expect(css).toMatch(/url\("\/fonts\/fredoka\.woff2"\)/);
    expect(css).toMatch(/url\("\/fonts\/pixelify-sans\.woff2"\)/);
    expect(css).not.toMatch(/https?:\/\//);
  });

  it("declares the two weights the type scale actually uses", () => {
    const css = toFontFaceCss();
    expect(css).toMatch(/font-family: "Fredoka";\s*\n\s*src: [^\n]+\n\s*font-weight: 500 700;/);
    expect(css).toMatch(/font-family: "Pixelify Sans";\s*\n\s*src: [^\n]+\n\s*font-weight: 700;/);
  });

  it("every URL it references resolves to a committed file under packages/theme/fonts/", () => {
    expect(existsSync(join(FONTS_DIR, "fredoka/fredoka.woff2"))).toBe(true);
    expect(existsSync(join(FONTS_DIR, "fredoka/OFL.txt"))).toBe(true);
    expect(existsSync(join(FONTS_DIR, "pixelify-sans/pixelify-sans.woff2"))).toBe(true);
    expect(existsSync(join(FONTS_DIR, "pixelify-sans/OFL.txt"))).toBe(true);
  });

  it("the two WOFF2 files together stay at or under the 40 KB budget (AC1)", () => {
    const total =
      statSync(join(FONTS_DIR, "fredoka/fredoka.woff2")).size +
      statSync(join(FONTS_DIR, "pixelify-sans/pixelify-sans.woff2")).size;
    expect(total).toBeLessThanOrEqual(40 * 1024);
  });
});

/**
 * CC-4.12 AC3: every character docs/architecture/security.md's "Player names" section allows
 * (`A-Z`, `a-z`, digits, "Latin letters with accents (Latin-1 Supplement and Latin Extended-A
 * letters)") must map to a real glyph, not .notdef, in the font names actually render in.
 *
 * Names only ever render in Fredoka (docs/HOUSE_STYLE.md, "Type": Fredoka is "Everything people
 * read: … names"; Pixelify Sans is "Only numbers, scores, timers, room codes and in-game
 * callouts" — see also "Chalk pill": "name in Fredoka, optional score in Pixelify Sans"), so this
 * checks Fredoka's committed WOFF2 cmap, not Pixelify Sans's.
 *
 * Basic Latin and the full Latin-1 Supplement letter range (0x00C0-0x00FF, minus the non-letter ×
 * and ÷) are upstream Fredoka's whole range — this is what renders the owner's 2026-09-17
 * examples (Renée, Chloë, Zoë, Jürgen). Latin Extended-A (0x0100-0x017F) is only *partially* in
 * upstream Fredoka (probed with harfbuzzjs before writing tooling/fonts/src/charset.ts's
 * `FREDOKA_EXTENDED_A_LETTERS`: 10 of 128 codepoints — ı Ł ł Œ œ Š š Ÿ Ž ž). This test asserts
 * exactly that — the coverage this story's charset claims and ships — rather than the full
 * Extended-A block, so it stays honest about what the font can actually do: a name using one of
 * the other 118 Extended-A letters falls back to the next family in `--font-ui` (never a box, per
 * security.md "A name must never show as boxes on the TV", but not in Fredoka's own voice).
 * Flagged on the task for CC-2.4 (player-name validation) to match its allowlist to this set.
 */
describe("Fredoka accented-name glyph coverage (CC-4.12 AC3)", () => {
  let fredokaCodepoints: Set<number>;

  beforeAll(async () => {
    fredokaCodepoints = await coveredCodepoints(join(FONTS_DIR, "fredoka/fredoka.woff2"));
  }, 30_000);

  it("covers Basic Latin letters and digits", () => {
    for (const ch of "ABCXYZabcxyz0129") {
      expect(fredokaCodepoints.has(ch.codePointAt(0)!)).toBe(true);
    }
  });

  it("covers the owner's 2026-09-17 accented-name examples", () => {
    for (const name of ["Renée", "Chloë", "Zoë", "Jürgen"]) {
      for (const ch of name) expect(fredokaCodepoints.has(ch.codePointAt(0)!)).toBe(true);
    }
  });

  it("covers every Latin-1 Supplement letter (U+00C0-U+00FF, minus × and ÷)", () => {
    for (let cp = 0x00c0; cp <= 0x00ff; cp++) {
      if (cp === 0x00d7 || cp === 0x00f7) continue; // × and ÷ aren't letters
      expect(fredokaCodepoints.has(cp)).toBe(true);
    }
  });

  it("covers the Latin Extended-A letters this story's charset claims (10 of 128)", () => {
    for (const ch of "ıŁłŒœŠšŸŽž") {
      expect(fredokaCodepoints.has(ch.codePointAt(0)!)).toBe(true);
    }
  });
});
