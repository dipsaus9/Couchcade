import { describe, expect, it } from "vitest";
import { NAME_CHARACTERS } from "@couchcade/utils/names";
import { FREDOKA_TEXT, PIXELIFY_TEXT } from "../src/charset.ts";

describe("FREDOKA_TEXT", () => {
  it("covers upper- and lower-case letters and digits", () => {
    for (const ch of "ABCXYZabcxyz0129") expect(FREDOKA_TEXT).toContain(ch);
  });

  it("covers the punctuation the story calls out", () => {
    for (const ch of "‘’“”–—…×") {
      expect(FREDOKA_TEXT).toContain(ch);
    }
  });

  it("has no duplicate characters", () => {
    expect(new Set(FREDOKA_TEXT).size).toBe(FREDOKA_TEXT.length);
  });

  it("covers the owner's 2026-09-17 accented-name examples (CC-4.12)", () => {
    for (const name of ["Renée", "Chloë", "Zoë", "Jürgen"]) {
      for (const ch of name) expect(FREDOKA_TEXT).toContain(ch);
    }
  });

  it("covers every Latin-1 Supplement letter (U+00C0-U+00FF, minus × and ÷)", () => {
    for (let cp = 0x00c0; cp <= 0x00ff; cp++) {
      const ch = String.fromCodePoint(cp);
      if (ch === "×" || ch === "÷") continue;
      expect(FREDOKA_TEXT).toContain(ch);
    }
  });

  it("covers the Latin Extended-A letters upstream Fredoka actually has a glyph for", () => {
    for (const ch of "ıŁłŒœŠšŸŽž") expect(FREDOKA_TEXT).toContain(ch);
  });

  it("covers every character a player name may use (CC-2.4)", () => {
    for (const ch of NAME_CHARACTERS) expect(FREDOKA_TEXT).toContain(ch);
  });
});

describe("PIXELIFY_TEXT", () => {
  it("covers upper-case letters and digits, never lower-case", () => {
    for (const ch of "ABCXYZ0129") expect(PIXELIFY_TEXT).toContain(ch);
    expect(/[a-z]/.test(PIXELIFY_TEXT)).toBe(false);
  });

  it("has no duplicate characters", () => {
    expect(new Set(PIXELIFY_TEXT).size).toBe(PIXELIFY_TEXT.length);
  });
});
