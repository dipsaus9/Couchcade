/**
 * A small NL + EN blocklist of 4-letter words `roomCode()` redraws away from (security.md
 * decision 20). Every entry is exactly `ROOM_CODE_LENGTH` letters, built only from
 * `ROOM_CODE_ALPHABET`. Some entries are the common letter-substitution spelling of a word that
 * itself contains `I` or `O` and so can never come out of the alphabet directly.
 */
export const BLOCKED_ROOM_CODES: readonly string[] = [
  "FUCK",
  "CUNT",
  "TWAT",
  "SLUT",
  "WANK",
  "ARSE",
  "SLAG",
  "CUCK",
  "SHYT",
  "DYCK",
  "PYSS",
  "TRUT",
  "TEEF",
  "REET",
  "HUER",
];
