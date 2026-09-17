/** Letters that don't split into a base letter and an accent, spelled out in plain a to z. */
const PLAIN_SPELLING: Readonly<Record<string, string>> = {
  æ: "ae",
  ð: "d",
  ı: "i",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

/** Common swaps of a digit or symbol for a letter (docs/architecture/security.md, "Blocklist"). */
const LETTER_SWAPS: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/**
 * The folded copy of a name that the blocklist runs on: lower case, accents stripped, common
 * swaps like `4` for `a` mapped back, everything but a to z removed, and repeated letters
 * collapsed. "F.u_u 4 r" and "fuar" fold to the same string. The stored name is never folded.
 */
export function foldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[æðıłøœßþ]/g, (letter) => PLAIN_SPELLING[letter] ?? letter)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[013457@$]/g, (swap) => LETTER_SWAPS[swap] ?? swap)
    .replace(/[^a-z]/g, "")
    .replace(/([a-z])\1+/g, "$1");
}
