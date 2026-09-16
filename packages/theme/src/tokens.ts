/**
 * The house style as data: the single source of truth for colour, type, shape and motion.
 * Every value here comes from docs/HOUSE_STYLE.md, plus the ink tints and the small TV button
 * the owner approved with the platform screens design on 2026-09-16
 * (docs/design/platform-screens.md). Change a value there first, then here.
 */

/** A colour as `#RRGGBB`, upper case. */
export type Hex = `#${string}`;

/** The six core colours. They carry the entire interface. */
export const color = {
  /** Outlines, text, shadows. */
  ink: "#1E2A4A",
  /** Panels, controller background. */
  chalk: "#FAFCFF",
  /** Menus, lobby, letterboxing. */
  sky: "#8FD3F4",
  /** The single most important action on a screen, focus ring. */
  sunny: "#FFC83D",
  /** Go, success, your turn. */
  turf: "#37B26C",
  /** Stop, foul, leave. */
  signal: "#EF4F5A",
} as const satisfies Record<string, Hex>;

/**
 * Ink mixed into a light fill, as solid colours (no transparency over anything).
 * The number is the share of Ink.
 */
export const tint = {
  /** Ink 20% on Chalk: disabled outlines, progress ring track. */
  ink20: "#CED2DB",
  /** Ink 20% on Sky: empty lobby slot outline. */
  ink20OnSky: "#78B1D2",
  /** Ink 45% on Chalk: disabled labels only. Disabled controls are exempt from WCAG AA. */
  ink45: "#979EAE",
  /** Ink 70% on Chalk: placeholders, waiting values, secondary hints. Passes AA on Chalk. */
  ink70: "#60697F",
} as const satisfies Record<string, Hex>;

export type CoreColorName = keyof typeof color;
export type TintName = keyof typeof tint;
/** Any named interface colour: core or tint. */
export type ColorName = CoreColorName | TintName;

export type PlayerShape =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "star"
  | "hexagon"
  | "heart"
  | "plus";

/** Eight players, assigned in join order. The shape appears everywhere the colour does. */
export const players = [
  { id: "cherry", color: "#EF4F5A", shape: "circle" },
  { id: "ocean", color: "#2F7DE1", shape: "square" },
  { id: "sunny", color: "#FFC83D", shape: "triangle" },
  { id: "turf", color: "#37B26C", shape: "diamond" },
  { id: "grape", color: "#8C5BD6", shape: "star" },
  { id: "tangerine", color: "#FF8A3D", shape: "hexagon" },
  { id: "bubblegum", color: "#F277B6", shape: "heart" },
  { id: "teal", color: "#1FB5B0", shape: "plus" },
] as const satisfies readonly { id: string; color: Hex; shape: PlayerShape }[];

/** Pip parts: six skin tones and six hair colours. */
export const pip = {
  skin: ["#FBDDC0", "#F5C9A0", "#E8B083", "#C68B5E", "#8D5A3B", "#5C3A24"],
  hair: ["#1E2A4A", "#5C3A24", "#E0A15E", "#F4E3C1", "#EF4F5A", "#8C5BD6"],
} as const satisfies Record<string, readonly Hex[]>;

export const font = {
  ui: '"Fredoka", "Nunito", "Arial Rounded MT Bold", system-ui, sans-serif',
  pixel: '"Pixelify Sans", "Courier New", monospace',
} as const;

export type FontName = keyof typeof font;

export interface TypeRole {
  readonly font: FontName;
  readonly weight: 500 | 700;
  /** Size in px on the TV at 1080p. */
  readonly tv: number;
  /** Size in px on the phone, or null when the role isn't used there. */
  readonly phone: number | null;
}

/** The type scale. Nothing is smaller than `small`. */
export const typeScale = {
  /** STRIKE!, DRAW!, FOUL! */
  callout: { font: "pixel", weight: 700, tv: 160, phone: null },
  /** Points, timers, room code. */
  score: { font: "pixel", weight: 700, tv: 72, phone: 40 },
  /** Screen titles. */
  title: { font: "ui", weight: 700, tv: 56, phone: 28 },
  /** Button labels. */
  action: { font: "ui", weight: 700, tv: 40, phone: 28 },
  /** Instructions, names. */
  body: { font: "ui", weight: 500, tv: 32, phone: 18 },
  /** Hints, captions (minimum size). */
  small: { font: "ui", weight: 500, tv: 24, phone: 16 },
} as const satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof typeScale;

/** Outline, depth and corners. All lengths are px unless noted. */
export const shape = {
  /** Always Ink. */
  outline: { phone: 3, tv: 4 },
  /** Hard Ink shadows straight down. A pressed element also moves down by `pressOffset`. */
  depth: { rest: 6, pressed: 2, panel: 6, pressOffset: 4 },
  radius: { pill: 999, panel: 20, tag: 10 },
  /** All spacing; nothing in between. */
  space: [4, 8, 12, 16, 24, 32, 48, 64],
  /** Smallest tap target on the phone. */
  touchMin: 56,
  /** Sunny focus ring on everything interactive. */
  focusRing: { width: 4, offset: 4 },
  /** Height of the small TV button (Kick on a lobby card). */
  tvButtonSmall: 64,
  /** Safe area on every side of the TV, as a fraction of the screen. */
  safeTv: 0.05,
} as const;

export interface MotionToken {
  readonly ms: number;
  /** A CSS easing, or the name of a keyframed effect (squash, pop, wobble). */
  readonly ease: string;
}

export const motion = {
  press: { ms: 80, ease: "ease-out" },
  ui: { ms: 180, ease: "cubic-bezier(.34,1.56,.64,1)" },
  scene: { ms: 400, ease: "ease-in-out" },
  yourTurn: { ms: 600, ease: "squash" },
  celebrate: { ms: 900, ease: "pop" },
  foul: { ms: 500, ease: "wobble" },
} as const satisfies Record<string, MotionToken>;

/** Game worlds: internal resolution and the colour cap (core plus one scene palette). */
export const world = { width: 480, height: 270, maxColors: 16 } as const;

/**
 * An allowed pairing of text on a background. Only these pairs may carry text; the theme tests
 * check each one against WCAG AA.
 */
export interface TextPair {
  readonly text: ColorName;
  readonly background: ColorName;
  /**
   * The Ink outline the text must carry on this background. WCAG treats an outline wide enough
   * to fill the letter's inner details as the text's background, so the text is checked against
   * the halo, and the halo against the background.
   */
  readonly halo?: ColorName;
  /** True for disabled controls only. WCAG 1.4.3 sets no contrast requirement for them. */
  readonly disabled?: boolean;
  readonly use: string;
}

export const textPairs = [
  { text: "ink", background: "chalk", use: "Panels, chips, quiet buttons, controller" },
  { text: "ink", background: "sky", use: "Menus, lobby, tabs" },
  { text: "ink", background: "sunny", use: "Primary buttons, hold state" },
  { text: "ink70", background: "chalk", use: "Placeholders, waiting values, secondary hints" },
  {
    text: "chalk",
    background: "turf",
    halo: "ink",
    use: "Go buttons, act-now state",
  },
  {
    text: "chalk",
    background: "signal",
    halo: "ink",
    use: "Stop buttons, don't-tap-yet state, stop badges",
  },
  { text: "sunny", background: "turf", halo: "ink", use: "Callouts on the tap-now flash" },
  { text: "ink45", background: "chalk", disabled: true, use: "Disabled labels only" },
] as const satisfies readonly TextPair[];

/**
 * A game world's extra colours. Each game declares one in `src/scenes/<game-id>.ts`.
 * Core plus scene colours may not exceed `world.maxColors`.
 */
export type ScenePaletteId = string;

export interface ScenePalette {
  readonly id: ScenePaletteId;
  readonly colors: readonly Hex[];
}

/** Every token, for the generators. */
export const tokens = {
  color,
  tint,
  players,
  pip,
  font,
  typeScale,
  shape,
  motion,
  world,
  textPairs,
} as const;

export type Tokens = typeof tokens;
