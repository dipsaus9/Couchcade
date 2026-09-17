// The Worker's player name check (docs/architecture/security.md, "Player names"). The phone runs
// the same `checkName` from @couchcade/utils for instant feedback; this one is the check that
// counts, and it runs before a ticket is issued.

import { checkName } from "@couchcade/utils/names";

/**
 * The name to store and put in the ticket: the raw name after NFKC, trimming and collapsing
 * spaces. Null when it breaks a rule (length, allowlist, no letter or digit, or the NL + EN
 * blocklist), which the API answers with 400 `name-not-allowed`. Which rule it broke isn't
 * returned: the phone already explains that, and the log line never holds the name.
 */
export function allowedPlayerName(raw: string): string | null {
  const result = checkName(raw);
  return result.ok ? result.name : null;
}
