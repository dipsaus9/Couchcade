import { createRng } from "../rng/index.ts";

/**
 * Options per Pip part (docs/architecture/pips.md "Parts", HOUSE_STYLE "Pips"). This is the one
 * source of truth for how many options each part has: `@couchcade/protocol`'s `pipProfileSchema`
 * imports these counts instead of keeping its own copy, and `@couchcade/theme`'s Pip geometry and
 * `randomPip` below read them too, so nobody can drift out of sync.
 *
 * The order of `hair` is part of the wire format and is frozen: a new hairstyle is only ever
 * appended at the end, never inserted or reordered, so a saved Pip never changes look
 * (pips.md decision 4).
 */
export const pipParts = {
  skin: 6,
  hair: ["short", "bun", "cap", "long", "curls", "buzz", "ponytail", "bald"],
  hairColour: 6,
} as const;

/** One of `pipParts.hair`'s ids. */
export type PipHairstyle = (typeof pipParts.hair)[number];

/**
 * A Pip's look: one index per part (pips.md "Profile data model"). Structurally the same shape as
 * `@couchcade/protocol`'s `PipProfile`, so a value built here validates against
 * `pipProfileSchema` without conversion.
 */
export interface PipProfile {
  /** Index into a 6-tone skin palette: 0 to `pipParts.skin - 1`. */
  skin: number;
  /** Index into `pipParts.hair`. */
  hair: number;
  /** Index into a 6-colour hair palette: 0 to `pipParts.hairColour - 1`. */
  hairColour: number;
}

/**
 * A random Pip look, uniform over all `pipParts.skin * pipParts.hair.length * pipParts.hairColour`
 * (288) combinations. Draws `skin`, `hair` and `hairColour` in that order from a seeded generator
 * (pips.md "Random Pips"), so the same seed always gives the same Pip on every device.
 *
 * Not cryptographic, and doesn't need to be: a Pip is not a secret. Callers who need an
 * unpredictable first Pip seed this from `crypto.getRandomValues` (pips.md item 2); callers who
 * need a Pip for a specific player seed it deterministically (pips.md item 4).
 */
export function randomPip(seed: number): PipProfile {
  const rng = createRng(seed);
  return {
    skin: rng.int(0, pipParts.skin - 1),
    hair: rng.int(0, pipParts.hair.length - 1),
    hairColour: rng.int(0, pipParts.hairColour - 1),
  };
}
