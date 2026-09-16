import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toFontFaceCss } from "@couchcade/theme/generate";

const FONTS_DIR = join(import.meta.dirname, "../fonts");

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
