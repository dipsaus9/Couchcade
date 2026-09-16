import { isRoomCode, ROOM_CODE_LENGTH } from "@couchcade/utils";

/** Longest name a player can pick, in characters (docs/architecture/security.md, "Player names"). */
export const nameMaxLength = 12;

/** What the player typed on the join screen. */
export interface JoinDraft {
  code: string;
  name: string;
  /** True when the code came from the QR link (`/?room=CODE`). */
  codeFromUrl: boolean;
}

export type CodeProblem = "incomplete";
export type NameProblem = "empty" | "too-long";

export interface JoinFormCheck {
  code: CodeProblem | null;
  name: NameProblem | null;
  /** Both fields are fine, so Join is enabled. */
  ready: boolean;
}

/**
 * The room code from the page URL, or null. `?room=` is used only when it is a room code, so
 * nothing else from the URL reaches the page (docs/architecture/security.md, "Text stays text").
 * Lower case is accepted, because people retype links.
 */
export function roomCodeFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("room")?.trim().toUpperCase() ?? "";
  return isRoomCode(value) ? value : null;
}

/** Cleans the code field as the player types: letters only, upper case, at most 4. */
export function cleanRoomCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

/**
 * The name as it is sent: NFKC, trimmed, runs of spaces collapsed into one. The server's check is
 * the one that counts; CC-2.4 adds the character allowlist and blocklists to both ends.
 */
export function normaliseName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** Length of the normalised name in characters (code points), as the name rules count it. */
export function nameLength(raw: string): number {
  return [...normaliseName(raw)].length;
}

export function checkName(raw: string): NameProblem | null {
  const length = nameLength(raw);
  if (length === 0) return "empty";
  return length > nameMaxLength ? "too-long" : null;
}

export function checkJoinForm({ code, name }: Pick<JoinDraft, "code" | "name">): JoinFormCheck {
  const codeProblem = isRoomCode(code) ? null : "incomplete";
  const nameProblem = checkName(name);
  return { code: codeProblem, name: nameProblem, ready: !codeProblem && !nameProblem };
}
