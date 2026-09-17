import { assert, constantFrom, oneof, property, string, type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EN_NAME_BLOCKLIST,
  NAME_CHARACTERS,
  NAME_LETTERS,
  NAME_MAX_LENGTH,
  NL_NAME_BLOCKLIST,
  checkName,
  foldName,
  isBlockedName,
  nameLength,
  normaliseName,
} from "../src/names/index.ts";

const allowed = new Set(NAME_CHARACTERS);
const codePoints = (value: string) => [...value].map((character) => character.codePointAt(0));

/** Characters that try to sneak past the rules: formatting, lookalikes, compatibility forms. */
const TRICKY = [
  "\u200B", // zero-width space
  "\u200D", // zero-width joiner
  "\u2060", // word joiner
  "\uFEFF", // byte order mark
  "\u202E", // right-to-left override
  "\u2066", // left-to-right isolate
  "\u0301", // combining acute accent
  "\u0000", // null
  "\t",
  "\n",
  "\u00A0", // no-break space
  "\u3000", // ideographic space
  "а", // Cyrillic a
  "ο", // Greek omicron
  "Ａ", // fullwidth A
  "①", // circled digit one
  "ﬁ", // fi ligature
  "ſ", // long s
  "İ", // I with dot above
  "ą", // Latin Extended-A letter Fredoka can't draw
  "🙂",
  "👍🏽",
  "©",
  "@",
  "!",
];

/** One code point: mostly allowed characters, so valid names come up often, mixed with anything. */
const nameUnit: Arbitrary<string> = oneof(
  { arbitrary: constantFrom(...NAME_CHARACTERS), weight: 6 },
  { arbitrary: constantFrom(...TRICKY), weight: 2 },
  { arbitrary: string({ unit: "binary", minLength: 1, maxLength: 1 }), weight: 2 },
);
const rawName = string({ unit: nameUnit, maxLength: 20 });

/** Disguises a player might try: case, spacing, accents, swaps, doubled and fullwidth letters. */
function disguises(word: string): string[] {
  const fullwidth = word.replace(/[a-z]/g, (letter) =>
    String.fromCodePoint(letter.codePointAt(0)! - 0x61 + 0xff41),
  );
  return [
    word,
    word.toUpperCase(),
    [...word].join(" "),
    [...word].join("."),
    word.replace(/e/g, "3").replace(/a/g, "4").replace(/o/g, "0").replace(/i/g, "1"),
    word.replace(/e/g, "é").replace(/u/g, "ü").replace(/a/g, "à"),
    word.replace(/([a-z])/, "$1$1"),
    fullwidth,
  ];
}

describe("NAME_CHARACTERS", () => {
  it("is A to Z, the 62 Latin-1 letters, the 10 Extended-A letters Fredoka has, digits and ' - . _", () => {
    expect(NAME_LETTERS).toHaveLength(52 + 62 + 10);
    expect(NAME_CHARACTERS).toHaveLength(124 + 10 + 5);
    expect(new Set(NAME_CHARACTERS).size).toBe(NAME_CHARACTERS.length);
    for (const name of ["Renée", "Chloë", "Zoë", "Jürgen", "Łukasz", "Šárka", "O'Neil-Smit Jr._"]) {
      for (const character of name) expect(NAME_CHARACTERS).toContain(character);
    }
  });

  it("holds only characters NFKC leaves alone, so a stored name stays normalised", () => {
    for (const character of NAME_CHARACTERS) expect(character.normalize("NFKC")).toBe(character);
  });
});

describe("normaliseName", () => {
  it("applies NFKC, trims and collapses runs of spaces", () => {
    expect(normaliseName("  Sam   the  Man ")).toBe("Sam the Man");
    expect(normaliseName("Ｓａｍ")).toBe("Sam");
    expect(normaliseName("Rene\u0301e")).toBe("Renée");
    expect(normaliseName("Sam\u00A0\u3000Jo")).toBe("Sam Jo");
  });

  it("counts code points, not UTF-16 units", () => {
    expect(nameLength("  Sam  ")).toBe(3);
    expect(nameLength("Zoë")).toBe(3);
    expect(nameLength("🙂🙂")).toBe(2);
  });

  it("is idempotent (property)", () => {
    assert(
      property(rawName, (raw) => {
        const once = normaliseName(raw);
        expect(normaliseName(once)).toBe(once);
      }),
    );
  });

  it("never leaves spaces at the ends or two in a row (property)", () => {
    assert(
      property(rawName, (raw) => {
        expect(normaliseName(raw)).not.toMatch(/^ | $|  /);
      }),
    );
  });
});

describe("checkName", () => {
  it("accepts ordinary NL and EN names and returns them normalised", () => {
    for (const name of [
      "Sam",
      "Zoë",
      "Renée",
      "Jürgen",
      "Łukasz",
      "Noor",
      "Twelve chars",
      "R2-D2",
    ]) {
      expect(checkName(name)).toEqual({ ok: true, name });
    }
    expect(checkName("  Anne-Marie ")).toEqual({ ok: true, name: "Anne-Marie" });
    expect(checkName("Ｊｏｏｐ")).toEqual({ ok: true, name: "Joop" });
  });

  it("requires 1 to 12 code points after normalising", () => {
    expect(checkName("")).toEqual({ ok: false, problem: "empty" });
    expect(checkName(" \u3000 ")).toEqual({ ok: false, problem: "empty" });
    expect(checkName("S")).toMatchObject({ ok: true });
    expect(checkName("Thirteen char")).toEqual({ ok: false, problem: "too-long" });
    expect(checkName("  Twelve     chars  ")).toMatchObject({ ok: true, name: "Twelve chars" });
  });

  it("refuses emoji, symbols, control, zero-width and bidi characters and other scripts", () => {
    // No-break and wide spaces become spaces; fullwidth, circled and ligature forms become
    // their plain letters under NFKC. Everything else in TRICKY must be refused.
    const refused = TRICKY.filter((character) => !/^[\u00A0\u3000Ａ①ﬁſ]$/u.test(character));
    for (const character of refused) {
      expect({ character: codePoints(character), result: checkName(`Sam${character}Jo`) }).toEqual({
        character: codePoints(character),
        result: { ok: false, problem: "character" },
      });
    }
    expect(checkName("Sаm")).toEqual({ ok: false, problem: "character" }); // Cyrillic а
    expect(checkName("Ąga")).toEqual({ ok: false, problem: "character" });
    expect(checkName("Sam 🙂")).toEqual({ ok: false, problem: "character" });
  });

  it("needs at least one letter or digit", () => {
    for (const name of ["...", "- _ -", "'"]) {
      expect(checkName(name)).toEqual({ ok: false, problem: "no-letter" });
    }
    expect(checkName("7")).toMatchObject({ ok: true });
  });

  it("accepts only 1 to 12 allowed code points, already normalised (property)", () => {
    assert(
      property(rawName, (raw) => {
        const result = checkName(raw);
        if (!result.ok) return;
        const characters = [...result.name];
        expect(characters.length).toBeGreaterThanOrEqual(1);
        expect(characters.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
        expect(characters.every((character) => allowed.has(character))).toBe(true);
        expect(normaliseName(result.name)).toBe(result.name);
        expect(checkName(result.name)).toEqual(result);
      }),
    );
  });

  it("refuses every raw name with a disallowed code point that survives normalising (property)", () => {
    assert(
      property(rawName, (raw) => {
        const normalised = normaliseName(raw);
        if ([...normalised].every((character) => allowed.has(character))) return;
        expect(checkName(raw).ok).toBe(false);
      }),
    );
  });
});

describe("foldName", () => {
  it("lowercases, strips accents, maps swaps, keeps a to z only and collapses repeats", () => {
    expect(foldName("Renée")).toBe("rene");
    expect(foldName("Łukasz Øster")).toBe("lukaszoster");
    expect(foldName("Straße")).toBe("strase");
    expect(foldName("J0 0p_")).toBe("jop");
    expect(foldName("H3ll0 W0rld")).toBe("heloworld");
    expect(foldName("$4m 7@5")).toBe("samtas");
  });

  it("returns only a to z without repeated letters, and is idempotent (property)", () => {
    assert(
      property(rawName, (raw) => {
        const folded = foldName(normaliseName(raw));
        expect(folded).toMatch(/^[a-z]*$/);
        expect(folded).not.toMatch(/([a-z])\1/);
        expect(foldName(folded)).toBe(folded);
      }),
    );
  });
});

describe("name blocklists", () => {
  const allAnywhere = [...EN_NAME_BLOCKLIST.anywhere, ...NL_NAME_BLOCKLIST.anywhere];
  const allWhole = [...EN_NAME_BLOCKLIST.whole, ...NL_NAME_BLOCKLIST.whole];

  it("stores every entry folded, without duplicates, short enough to fit a name", () => {
    for (const list of [EN_NAME_BLOCKLIST, NL_NAME_BLOCKLIST]) {
      expect(list.anywhere.length).toBeGreaterThan(0);
      expect(list.whole.length).toBeGreaterThan(0);
    }
    const entries = [...allAnywhere, ...allWhole];
    expect(new Set(entries).size).toBe(entries.length);
    for (const word of entries) {
      expect(foldName(word)).toBe(word);
      expect(word.length).toBeGreaterThanOrEqual(3);
      expect(word.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
    }
  });

  it("rejects every entry as a whole name, however it's disguised", () => {
    for (const word of [...allAnywhere, ...allWhole]) {
      for (const disguise of disguises(word)) {
        if (nameLength(disguise) > NAME_MAX_LENGTH) continue;
        expect({ disguise, result: checkName(disguise) }).toEqual({
          disguise,
          result: { ok: false, problem: "blocked" },
        });
      }
    }
  });

  it("matches long words anywhere in the name and short words only as the whole name", () => {
    for (const word of allAnywhere) {
      expect(isBlockedName(`x ${word}`.slice(0, NAME_MAX_LENGTH))).toBe(true);
    }
    for (const word of allWhole) {
      expect(isBlockedName(`Mo ${word}`)).toBe(false);
    }
  });

  it("lets ordinary names through, including ones that contain a short word", () => {
    const names = [
      "Dick",
      "Bob",
      "Scott",
      "Nazir",
      "Kutlu",
      "Pedro",
      "Lulu",
      "Kshitij",
      "Tanigawa",
      "Cockburn",
      "Homan",
      "Piknik",
      "Pieter",
      "Sanne",
      "Anneke",
      "Mohammed",
      "Tessa",
      "Arsenio",
      "Constance",
      "Hoekstra",
      "Tering Jr",
      "Slettenhaar",
      "Neuker",
      "Penistone",
    ];
    for (const name of names) {
      expect({ name, result: checkName(name) }).toEqual({ name, result: { ok: true, name } });
    }
  });
});
