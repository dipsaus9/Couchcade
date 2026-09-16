/**
 * English-only character sets to subset each font to (CC-4.3). Couchcade has no translation layer
 * (README.md, "Who it's for"), so neither font needs anything past Basic Latin plus the
 * punctuation the house voice actually uses (docs/HOUSE_STYLE.md, "Voice": "So close!", "Nice
 * spin!", contractions) and a few symbols used in code comments/labels today or named explicitly
 * for this story (curly quotes, en/em dash, ellipsis, the multiplication sign).
 */

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

/** Straight punctuation every sentence-case UI string can use. */
const STRAIGHT_PUNCTUATION = " .,!?'\"-:;()&%/";

/** Curly quotes, en dash, em dash, ellipsis, multiplication sign (×). */
const TYPOGRAPHIC_PUNCTUATION = "‘’“”–—…×";

/**
 * Fredoka (`--cc-font-ui`): body copy, titles, button labels. Upper- and lower-case, digits (player
 * counts, "2 to 8") and every punctuation mark above.
 */
export const FREDOKA_TEXT = UPPER + LOWER + DIGITS + STRAIGHT_PUNCTUATION + TYPOGRAPHIC_PUNCTUATION;

/**
 * Pixelify Sans (`--cc-font-pixel`): only numbers, scores, timers, room codes and in-game
 * callouts (docs/HOUSE_STYLE.md, "Type") — upper-case only (room codes and callouts are never
 * lower-case) plus digits and the handful of separators a timer or fraction needs.
 */
export const PIXELIFY_TEXT = UPPER + DIGITS + " !:./-";
