// The characters a player name may use (docs/architecture/security.md, "Player names", rules 3 to
// 5). Names render in Fredoka only (docs/HOUSE_STYLE.md, "Type"), so every character here must
// have a glyph in the subsetted Fredoka file. tooling/fonts builds that subset from this list, and
// packages/theme/test/fonts.test.ts reads the committed font back to prove it.

const range = (from: number, to: number): string =>
  String.fromCodePoint(...Array.from({ length: to - from + 1 }, (_, i) => from + i));

/** A to Z in both cases. */
const BASIC_LATIN_LETTERS = range(0x41, 0x5a) + range(0x61, 0x7a);

/** The 62 letters of Latin-1 Supplement (U+00C0 to U+00FF without × and ÷). */
const LATIN_1_LETTERS = range(0xc0, 0xff).replace(/[×÷]/g, "");

/**
 * The only Latin Extended-A letters upstream Fredoka has a glyph for (CC-4.12 probed its cmap):
 * dotless i, L and l with stroke, OE and oe, S and s with caron, Y with diaeresis, Z and z with
 * caron. The other 118 letters of the block, like ą, ć or ř, aren't in the font, so a name with
 * one would render in a fallback font instead of Fredoka. They aren't allowed.
 */
const LATIN_EXTENDED_A_LETTERS = "ıŁłŒœŠšŸŽž";

/** Every letter a name may use. A name needs at least one letter or digit. */
export const NAME_LETTERS = BASIC_LATIN_LETTERS + LATIN_1_LETTERS + LATIN_EXTENDED_A_LETTERS;

export const NAME_DIGITS = "0123456789";

/** Space and the four punctuation marks a name may use. */
export const NAME_PUNCTUATION = " '-._";

/** The whole allowlist. Nothing else, so no emoji, symbols, control or formatting characters. */
export const NAME_CHARACTERS = NAME_LETTERS + NAME_DIGITS + NAME_PUNCTUATION;
