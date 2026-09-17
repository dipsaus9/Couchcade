import { NAME_CHARACTERS } from "@couchcade/utils/names";

/**
 * English-only character sets to subset each font to (CC-4.3), expanded for accented player names
 * (CC-4.12). Couchcade has no translation layer (README.md, "Who it's for"), so the UI copy itself
 * stays Basic Latin plus the punctuation the house voice actually uses (docs/HOUSE_STYLE.md,
 * "Voice": "So close!", "Nice spin!", contractions) and a few symbols used in code comments/labels
 * today or named explicitly for CC-4.3 (curly quotes, en/em dash, ellipsis, the multiplication
 * sign). Player names are the one place accented Latin shows up (docs/architecture/security.md,
 * "Player names": "Latin letters with accents (Latin-1 Supplement and Latin Extended-A letters)"),
 * and names only ever render in Fredoka (docs/HOUSE_STYLE.md, "Type": "Everything people read: …
 * names" vs. Pixelify Sans "Only numbers, scores, timers, room codes and in-game callouts" — see
 * "Chalk pill" in the lobby section: "name in Fredoka, optional score in Pixelify Sans"). So only
 * `FREDOKA_TEXT` grows here; `PIXELIFY_TEXT` is untouched (CC-4.12 AC1/AC3 — see the note below).
 */

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

/** Straight punctuation every sentence-case UI string can use. */
const STRAIGHT_PUNCTUATION = " .,!?'\"-:;()&%/";

/** Curly quotes, en dash, em dash, ellipsis, multiplication sign (×). */
const TYPOGRAPHIC_PUNCTUATION = "‘’“”–—…×";

/**
 * Fredoka (`--cc-font-ui`): body copy, titles, button labels *and player names* (the only font
 * names render in — HOUSE_STYLE.md, "Type"). Upper- and lower-case, digits (player counts, "2 to
 * 8"), every punctuation mark above, and every character a player name may use.
 *
 * The name characters come from `@couchcade/utils/names`, the allowlist the phone and the Worker
 * check names against (docs/architecture/security.md, "Player names"), so the font can't drift
 * from it: rule 5 says a name never shows as boxes. That allowlist holds the 62 Latin-1 Supplement
 * letters and only the 10 Latin Extended-A letters upstream Fredoka has a glyph for (ı Ł ł Œ œ Š
 * š Ÿ Ž ž, probed with harfbuzzjs for CC-4.12), because subset-font silently drops a requested
 * codepoint the source font lacks. packages/theme/test/fonts.test.ts reads the committed WOFF2
 * back and fails if any allowed character is missing. CC-2.4 added the underscore this way.
 */
export const FREDOKA_TEXT = [
  ...new Set(
    UPPER + LOWER + DIGITS + STRAIGHT_PUNCTUATION + TYPOGRAPHIC_PUNCTUATION + NAME_CHARACTERS,
  ),
].join("");

/**
 * Pixelify Sans (`--cc-font-pixel`): only numbers, scores, timers, room codes and in-game
 * callouts (docs/HOUSE_STYLE.md, "Type") — upper-case only (room codes and callouts are never
 * lower-case) plus digits and the handful of separators a timer or fraction needs. Never player
 * names (Fredoka renders those — see the file header), so CC-4.12 doesn't add the accented-Latin
 * letters here even though upstream Pixelify Sans has them (probed: 62/62 Latin-1 Supplement,
 * 126/128 Latin Extended-A) — they'd never be drawn in this family and would only cost budget.
 */
export const PIXELIFY_TEXT = UPPER + DIGITS + " !:./-";
