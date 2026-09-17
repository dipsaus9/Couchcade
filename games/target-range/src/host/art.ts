import { color } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";

/**
 * The colours Target Range's world is painted with, by what they paint. Until CC-11.5 adds the
 * `range` scene palette and the CC0 art, every role is a core colour, so the placeholder range
 * already follows the palette rule. CC-11.5 points these roles at the `range` colours (mown
 * grass, hedge, wood, straw, target red) and swaps the drawn backdrop, target, flag, bow and
 * arrows in world.ts for sprites; the scene, the presentation and the layout stay as they are.
 */
export const art = {
  sky: color.sky,
  grass: color.turf,
  hedge: color.turf,
  /** Mixed with `hedge` in a 2×2 dither, so the hedge reads darker than the grass. */
  hedgeShade: color.ink,
  fence: color.chalk,
  wood: color.sunny,
  straw: color.sunny,
  strawSpeck: color.chalk,
  outline: color.ink,
  /** The target face's five bands from the edge in: white, black, blue, red, gold. */
  bands: [color.chalk, color.ink, color.sky, color.signal, color.sunny],
  flag: color.chalk,
  pole: color.ink,
  bow: color.ink,
  bowString: color.chalk,
  arrowShaft: color.chalk,
  arrowHead: color.ink,
} as const satisfies Record<string, Hex | readonly Hex[]>;

/** The band colour of ring `ring` (1 at the edge to 10 in the centre). */
export function bandColour(ring: number): Hex {
  const band = Math.min(4, Math.max(0, Math.floor((ring - 1) / 2)));
  return art.bands[band] as Hex;
}
