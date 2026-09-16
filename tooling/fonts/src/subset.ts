import subsetFont from "subset-font";
import { FREDOKA_TEXT, PIXELIFY_TEXT } from "./charset.ts";

/**
 * Fredoka's own axes are `wght` 300-700 and `wdth` 75-125 (METADATA.pb). HOUSE_STYLE.md's type
 * scale only ever uses weight 500 (body, small) and 700 (title, action) - see
 * packages/theme/src/tokens.ts `typeScale` - so the `wght` axis is narrowed to that range (still a
 * variable font: two static instances would cost more than one narrowed variable one) and `wdth`
 * is pinned to its default (100), dropping a whole axis of interpolation data Couchcade never
 * varies.
 */
export async function subsetFredoka(ttf: Buffer): Promise<Buffer> {
  return subsetFont(ttf, FREDOKA_TEXT, {
    targetFormat: "woff2",
    variationAxes: {
      wght: { min: 500, max: 700 },
      wdth: 100,
    },
  });
}

/**
 * Pixelify Sans's own axis is `wght` 400-700 (METADATA.pb). The type scale only ever uses pixel
 * weight 700 (callout, score - tokens.ts), so the axis is fully pinned: the output is a static
 * instance, smaller than keeping it variable for a weight nothing uses.
 */
export async function subsetPixelifySans(ttf: Buffer): Promise<Buffer> {
  return subsetFont(ttf, PIXELIFY_TEXT, {
    targetFormat: "woff2",
    variationAxes: {
      wght: 700,
    },
  });
}
