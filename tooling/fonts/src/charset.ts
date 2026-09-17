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
 * Latin-1 Supplement (U+00C0–U+00FF) minus its two non-letter codepoints: × (U+00D7, multiplication
 * sign, already in `TYPOGRAPHIC_PUNCTUATION`) and ÷ (U+00F7, division sign, not a house-style
 * symbol). Every remaining codepoint in this range is a letter — this is exactly the block
 * security.md means by "Latin-1 Supplement letters", and it's what renders the owner's 2026-09-17
 * examples: Renée, Chloë, Zoë, Jürgen (é ë ö ü are all in this block).
 */
const LATIN1_SUPPLEMENT_LETTERS = Array.from({ length: 0x00ff - 0x00c0 + 1 }, (_, i) =>
  String.fromCodePoint(0x00c0 + i),
)
  .filter((ch) => ch !== "×" && ch !== "÷")
  .join("");

/**
 * Latin Extended-A (U+0100–U+017F) is 128 codepoints, every one a letter (accented pairs, stroke
 * letters, the Ĳ/ĳ and Ŋ/ŋ digraphs, and a trailing ſ long s) — this is the block security.md means
 * by "Latin Extended-A letters". Of those 128, the upstream Fredoka variable font (CC-4.3's pinned
 * google/fonts commit) only ships a glyph for 10, found by probing its cmap with harfbuzzjs
 * (`face.collectUnicodes()`) before writing this list: ı Ł ł Œ œ Š š Ÿ Ž ž (the ones French,
 * Polish, Czech/Croatian/Slovenian and Turkish typography use most). subset-font silently drops
 * any requested codepoint the source font doesn't have (no error), so listing the full block here
 * would look complete but quietly ship an incomplete font — CC-4.12 AC3 checks the *committed*
 * WOFF2's cmap precisely so a future re-run (a font update, a wider Fredoka release) that adds more
 * glyphs is picked up automatically without anyone having to update this file by hand: re-running
 * `pnpm fonts:subset` and re-probing would need to grow this list only if that guard starts failing.
 * The 118 codepoints Fredoka doesn't have (diacritics like ā ă ą ć ĉ ċ č ď đ ē ĕ ė ę ě ĝ ğ ġ ģ ĥ ħ
 * ĩ ī ĭ į ĳ ĵ ķ ĸ ĺ ļ ľ ŀ ń ņ ň ŉ ŋ ō ŏ ő ŕ ŗ ř ś ŝ ş ţ ť ŧ ũ ū ŭ ů ű ų ŵ ŷ ź ż, and their uppercase
 * pairs) aren't in this font at all: a name using one of them falls back to the next family in
 * `--font-ui` (Nunito, Arial Rounded MT Bold, system-ui, sans-serif — HOUSE_STYLE.md "Type"), never
 * to a box, but not in Fredoka's own voice. Flagged for CC-2.4 (player-name validation, not yet
 * built, depends on this story) to decide whether its allowlist should match this exact set or
 * accept the fallback for the gap.
 */
const FREDOKA_EXTENDED_A_LETTERS = "ıŁłŒœŠšŸŽž";

/**
 * Fredoka (`--cc-font-ui`): body copy, titles, button labels *and player names* (the only font
 * names render in — HOUSE_STYLE.md, "Type"). Upper- and lower-case, digits (player counts, "2 to
 * 8"), every punctuation mark above, and the accented-Latin letters security.md's name allowlist
 * permits that upstream Fredoka actually has a glyph for (CC-4.12 AC1/AC3).
 */
export const FREDOKA_TEXT =
  UPPER +
  LOWER +
  DIGITS +
  STRAIGHT_PUNCTUATION +
  TYPOGRAPHIC_PUNCTUATION +
  LATIN1_SUPPLEMENT_LETTERS +
  FREDOKA_EXTENDED_A_LETTERS;

/**
 * Pixelify Sans (`--cc-font-pixel`): only numbers, scores, timers, room codes and in-game
 * callouts (docs/HOUSE_STYLE.md, "Type") — upper-case only (room codes and callouts are never
 * lower-case) plus digits and the handful of separators a timer or fraction needs. Never player
 * names (Fredoka renders those — see the file header), so CC-4.12 doesn't add the accented-Latin
 * letters here even though upstream Pixelify Sans has them (probed: 62/62 Latin-1 Supplement,
 * 126/128 Latin Extended-A) — they'd never be drawn in this family and would only cost budget.
 */
export const PIXELIFY_TEXT = UPPER + DIGITS + " !:./-";
