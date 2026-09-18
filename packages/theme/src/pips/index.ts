/**
 * The Interface Pip's vector geometry and part names (docs/architecture/pips.md "Interface Pip",
 * "Parts"). Data only, ported from the approved platform screens canvas: `@couchcade/ui`'s
 * `CcPip` and `@couchcade/stage`'s scoreboard heads both read it, so the two kit packages can't
 * draw Pips that drift apart (pips.md decision 10) without importing each other, which the
 * dependency tiers forbid.
 *
 * The hairstyle order below mirrors `@couchcade/utils`'s `pipParts.hair` (pips.md decision 4: a
 * saved Pip never changes look). It is a literal copy, not an import: theme declares no runtime
 * dependencies (see `packages/theme/package.json`), so `packages/theme/test/pips.test.ts` checks
 * the two lists match instead.
 */

/** Mirrors `@couchcade/utils`'s `pipParts.hair` order. Frozen: new styles are only ever appended. */
export const pipHairstyleIds = [
  "short",
  "bun",
  "cap",
  "long",
  "curls",
  "buzz",
  "ponytail",
  "bald",
] as const;

export type PipHairstyleId = (typeof pipHairstyleIds)[number];

export type PipExpression = "neutral" | "happy" | "surprised" | "sad";

export const pipExpressions = [
  "neutral",
  "happy",
  "surprised",
  "sad",
] as const satisfies readonly PipExpression[];

/** Screen reader names for `skin`, in index order (pips.md "Skin tones"). */
export const pipSkinNames = ["Tone 1", "Tone 2", "Tone 3", "Tone 4", "Tone 5", "Tone 6"] as const;

/** Screen reader labels for each hairstyle id (pips.md "Hairstyles"). */
export const pipHairNames: Record<PipHairstyleId, string> = {
  short: "Short",
  bun: "Bun",
  cap: "Cap",
  long: "Long",
  curls: "Curls",
  buzz: "Buzz",
  ponytail: "Ponytail",
  bald: "Bald",
};

/** Screen reader names for `hairColour`, in index order (pips.md "Hair colours"). */
export const pipHairColourNames = ["Navy", "Brown", "Caramel", "Blond", "Red", "Purple"] as const;

/**
 * Which house colour a part paints with. A renderer resolves the role to a hex (or CSS variable)
 * at draw time — the geometry itself never carries a colour, so it stays framework-agnostic data
 * (pips.md "Interface Pip": `{ tag, attrs, paint }`, no HTML strings).
 */
export type PipPaint = "skin" | "hair" | "jersey" | "chalk" | "ink";

export interface PipElement {
  readonly tag: "circle" | "path" | "rect";
  readonly attrs: Readonly<Record<string, string | number>>;
  /** Omitted for a part with no fill of its own, such as an outline-only stroke. */
  readonly paint?: PipPaint;
}

/** The two crops a Pip can be drawn at (pips.md "Interface Pip"). */
export const pipViewBox = { full: "0 0 100 112", head: "6 4 88 88" } as const;

/** viewBox width for each crop, used to keep the outline stroke an exact pixel width at any size. */
export const pipViewBoxWidth = { full: 100, head: 88 } as const;

/** Circle `cx 50, cy 48, r 30`, skin tone (pips.md "Interface Pip" geometry table). */
export const pipHead: PipElement = {
  tag: "circle",
  attrs: { cx: 50, cy: 48, r: 30 },
  paint: "skin",
};

/**
 * The jersey body from the shoulders (y 73) to the bottom edge, with a V-neck cut at the throat.
 * Player colour; audience Pips (no seat) paint this Chalk instead (pips.md "Fixed parts").
 */
export const pipJersey: PipElement = {
  tag: "path",
  attrs: {
    d: "M14 112 L18 78 Q18 71 25 68 L38 73 L50 84 L62 73 L75 68 Q82 71 82 78 L86 112 Z",
  },
  paint: "jersey",
};

/** The Chalk V-neck accent, drawn over the jersey at the throat. Skipped for audience Pips. */
export const pipJerseyNeck: PipElement = {
  tag: "path",
  attrs: { d: "M42 74 L50 84 L58 74 L54 70 L50 78 L46 70 Z" },
  paint: "chalk",
};

/** Where the seat's shape mark sits on the chest, scaled down from `@couchcade/ui`'s 24×24 shapes. */
export const pipChestTransform = "translate(41 89) scale(0.75)";

/**
 * One back layer (behind the head) per hairstyle that needs one: bun, long and ponytail
 * (pips.md "Interface Pip" geometry table). Every other style has none here.
 */
export const pipHairBack: Partial<Record<PipHairstyleId, PipElement>> = {
  bun: { tag: "circle", attrs: { cx: 50, cy: 21, r: 11 }, paint: "hair" },
  long: {
    tag: "path",
    attrs: {
      d: "M21 30 Q14 46 17 70 Q19 84 27 90 L33 86 Q27 80 26 68 Q25 46 30 32 Z M79 30 Q86 46 83 70 Q81 84 73 90 L67 86 Q73 80 74 68 Q75 46 70 32 Z",
    },
    paint: "hair",
  },
  ponytail: {
    tag: "path",
    attrs: { d: "M77 24 Q92 30 90 52 Q88 68 78 76 L71 70 Q80 62 81 50 Q82 34 71 27 Z" },
    paint: "hair",
  },
};

/**
 * One front layer (over the head) per hairstyle that needs one: short, cap, curls and buzz
 * (pips.md "Interface Pip" geometry table). `cap` takes the hair colour paint role even though a
 * real cap isn't hair, per pips.md "Hairstyles": "The cap takes the hair colour".
 */
export const pipHairFront: Partial<Record<PipHairstyleId, PipElement>> = {
  short: {
    tag: "path",
    attrs: {
      d: "M21 26 Q50 6 79 26 Q79 34 73 36 Q68 22 50 20 Q32 22 27 36 Q21 34 21 26 Z M58 24 Q66 26 68 34 L60 36 Z",
    },
    paint: "hair",
  },
  cap: {
    tag: "path",
    attrs: { d: "M20 30 Q50 4 80 30 Q80 34 76 34 L24 34 Q20 34 20 30 Z" },
    paint: "hair",
  },
  curls: {
    tag: "path",
    attrs: {
      // One merged outline of overlapping curls around the top of the head (pips.md: "Curls are
      // drawn as one merged outline").
      d: "M20 30 Q17 21 26 18 Q26 10 35 11 Q37 4 46 6 Q50 2 54 6 Q63 4 65 11 Q74 10 74 18 Q83 21 80 30 Q76 24 71 26 Q68 18 60 18 Q56 12 50 14 Q44 12 40 18 Q32 18 29 26 Q24 24 20 30 Z",
    },
    paint: "hair",
  },
  buzz: {
    tag: "path",
    attrs: { d: "M21 27 Q50 12 79 27 Q79 31 75 31 L25 31 Q21 31 21 27 Z" },
    paint: "hair",
  },
};

/**
 * Dot or arc eyes at x 39 and 61, y 53 (pips.md "Interface Pip"). Surprised gets bigger dots;
 * happy's arcs read as closed, smiling eyes.
 */
export const pipEyes: Record<PipExpression, readonly PipElement[]> = {
  neutral: [
    { tag: "circle", attrs: { cx: 39, cy: 53, r: 2.6 } },
    { tag: "circle", attrs: { cx: 61, cy: 53, r: 2.6 } },
  ],
  happy: [
    { tag: "path", attrs: { d: "M34 54 Q39 47 44 54" } },
    { tag: "path", attrs: { d: "M56 54 Q61 47 66 54" } },
  ],
  surprised: [
    { tag: "circle", attrs: { cx: 39, cy: 53, r: 3.6 } },
    { tag: "circle", attrs: { cx: 61, cy: 53, r: 3.6 } },
  ],
  sad: [
    { tag: "circle", attrs: { cx: 39, cy: 53, r: 2.6 } },
    { tag: "circle", attrs: { cx: 61, cy: 53, r: 2.6 } },
  ],
};

/**
 * The mouth: a small smile (neutral), an open smile (happy), an O (surprised) or a flat line
 * (sad) — the TV never shows this last one on its own (pips.md decision 11); it only ever reaches
 * a player's own phone.
 */
export const pipMouth: Record<PipExpression, PipElement> = {
  neutral: { tag: "path", attrs: { d: "M43 63 Q50 67 57 63" } },
  happy: { tag: "path", attrs: { d: "M40 61 Q50 74 60 61 Q50 70 40 61 Z" }, paint: "ink" },
  surprised: { tag: "circle", attrs: { cx: 50, cy: 64, r: 4.4 }, paint: "ink" },
  sad: { tag: "path", attrs: { d: "M43 65 L57 65" } },
};
