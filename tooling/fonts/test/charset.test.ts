import { describe, expect, it } from "vitest";
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
