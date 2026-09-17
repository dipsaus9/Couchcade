import { EN_NAME_BLOCKLIST, NL_NAME_BLOCKLIST } from "./blocklist.ts";
import { NAME_CHARACTERS, NAME_DIGITS, NAME_LETTERS } from "./characters.ts";
import { foldName } from "./fold.ts";

export { EN_NAME_BLOCKLIST, NL_NAME_BLOCKLIST, type NameBlocklist } from "./blocklist.ts";
export { NAME_CHARACTERS, NAME_DIGITS, NAME_LETTERS, NAME_PUNCTUATION } from "./characters.ts";
export { foldName } from "./fold.ts";

// Player name rules (docs/architecture/security.md, "Player names"). The phone runs `checkName`
// for instant feedback; the Worker runs the same function before it issues a ticket, and that's
// the check that counts.

/** Longest name, in code points after normalising. */
export const NAME_MAX_LENGTH = 12;

/**
 * Why a name isn't allowed. `character` is anything outside the allowlist (emoji, symbols, control
 * and formatting characters, other scripts); `no-letter` is a name of only spaces and punctuation;
 * `blocked` is a name on the NL or EN blocklist.
 */
export type NameProblem = "empty" | "too-long" | "character" | "no-letter" | "blocked";

export type NameCheck = { ok: true; name: string } | { ok: false; problem: NameProblem };

/**
 * NFKC, trimmed, and every run of spaces collapsed into one. This is the name that's stored. Only
 * U+0020 collapses: NFKC already turns no-break and wide spaces into it, and a tab, line break or
 * zero-width no-break space inside a name stays, so the allowlist refuses it.
 */
export function normaliseName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/ {2,}/g, " ");
}

/** Length of the normalised name in code points, the unit the length rule counts. */
export function nameLength(raw: string): number {
  return [...normaliseName(raw)].length;
}

const allowed = new Set(NAME_CHARACTERS);
const letterOrDigit = new Set(NAME_LETTERS + NAME_DIGITS);

const anywhere = [...EN_NAME_BLOCKLIST.anywhere, ...NL_NAME_BLOCKLIST.anywhere];
const whole = new Set([...EN_NAME_BLOCKLIST.whole, ...NL_NAME_BLOCKLIST.whole]);

/** True when the name's folded form is on the NL or EN blocklist. */
export function isBlockedName(name: string): boolean {
  const folded = foldName(name);
  return whole.has(folded) || anywhere.some((word) => folded.includes(word));
}

/** Normalises a raw name and checks it against every rule, cheapest first. */
export function checkName(raw: string): NameCheck {
  const name = normaliseName(raw);
  const characters = [...name];
  if (characters.length === 0) return { ok: false, problem: "empty" };
  if (characters.length > NAME_MAX_LENGTH) return { ok: false, problem: "too-long" };
  if (!characters.every((character) => allowed.has(character))) {
    return { ok: false, problem: "character" };
  }
  if (!characters.some((character) => letterOrDigit.has(character))) {
    return { ok: false, problem: "no-letter" };
  }
  if (isBlockedName(name)) return { ok: false, problem: "blocked" };
  return { ok: true, name };
}
