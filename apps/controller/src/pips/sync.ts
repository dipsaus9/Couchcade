import type { PipProfile } from "@couchcade/protocol";

/**
 * The room seats every player as `{ 0, 0, 0 }` until it reads the join body's profile
 * (docs/architecture/pips.md "Found while writing this spec", item 1 — fixed in a later story).
 * Until then this covers it: if the phone's remembered Pip differs from the one the room just
 * welcomed it with, send the remembered one once. Once the room honours the join body this only
 * fires in rare races, per the spec.
 */
export function profileToReconcile(remembered: PipProfile, seated: PipProfile): PipProfile | null {
  return remembered.skin === seated.skin &&
    remembered.hair === seated.hair &&
    remembered.hairColour === seated.hairColour
    ? null
    : remembered;
}
