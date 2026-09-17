import { isRoomCode, ROOM_CODE_LENGTH } from "@couchcade/utils";
import {
  checkName as checkNameRules,
  NAME_MAX_LENGTH,
  type NameProblem,
} from "@couchcade/utils/names";

// The name rules live in @couchcade/utils (docs/architecture/security.md, "Player names"). The
// phone runs the same function as the Worker, so honest players see a problem before they tap Join.
export { nameLength, normaliseName, type NameProblem } from "@couchcade/utils/names";

/** Longest name a player can pick, in code points after normalising. */
export const nameMaxLength = NAME_MAX_LENGTH;

/** What the player typed on the join screen. */
export interface JoinDraft {
  code: string;
  name: string;
  /** True when the code came from the QR link (`/?room=CODE`). */
  codeFromUrl: boolean;
}

export type CodeProblem = "incomplete";

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

/** What's wrong with the name, or null when the Worker will accept it. */
export function checkName(raw: string): NameProblem | null {
  const result = checkNameRules(raw);
  return result.ok ? null : result.problem;
}

export function checkJoinForm({ code, name }: Pick<JoinDraft, "code" | "name">): JoinFormCheck {
  const codeProblem = isRoomCode(code) ? null : "incomplete";
  const nameProblem = checkName(name);
  return { code: codeProblem, name: nameProblem, ready: !codeProblem && !nameProblem };
}
