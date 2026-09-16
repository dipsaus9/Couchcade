/**
 * Generated outputs of the tokens: CSS variables for the Vue apps and numeric colours for Phaser.
 * Both read the same token object, so the TV and the phone can't drift apart.
 */
import { tokens as houseTokens } from "../tokens.ts";
import type { Hex, Tokens } from "../tokens.ts";

export * from "./fonts.ts";

const HEX = /^#[0-9A-F]{6}$/i;
const CSS_EASING =
  /^(linear|ease(-in|-out|-in-out)?|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\))$/;

/** `ink20OnSky` becomes `ink-20-on-sky`, `yourTurn` becomes `your-turn`. */
function kebab(name: string): string {
  return name
    .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
    .replace(/([0-9])([A-Za-z])/g, "$1-$2")
    .toLowerCase();
}

const px = (value: number): string => `${value}px`;

/**
 * Every CSS custom property, in a stable order, keyed by name including the `--cc-` prefix.
 * Colours, tints, players, Pip parts, fonts, the type scale, shape and motion.
 */
export function cssVarEntries(tokens: Tokens = houseTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  const set = (name: string, value: string): void => {
    vars[`--cc-${name}`] = value;
  };

  for (const [name, hex] of Object.entries(tokens.color)) set(kebab(name), hex);
  for (const [name, hex] of Object.entries(tokens.tint)) set(kebab(name), hex);
  for (const player of tokens.players) {
    set(`player-${player.id}`, player.color);
  }
  tokens.pip.skin.forEach((hex, i) => set(`skin-${i + 1}`, hex));
  tokens.pip.hair.forEach((hex, i) => set(`hair-${i + 1}`, hex));

  for (const [name, stack] of Object.entries(tokens.font)) set(`font-${kebab(name)}`, stack);
  for (const [name, role] of Object.entries(tokens.typeScale)) {
    const prefix = `text-${kebab(name)}`;
    set(`${prefix}-font`, `var(--cc-font-${role.font})`);
    set(`${prefix}-weight`, String(role.weight));
    set(`${prefix}-tv`, px(role.tv));
    if (role.phone !== null) set(`${prefix}-phone`, px(role.phone));
  }

  const { shape } = tokens;
  set("outline-phone", px(shape.outline.phone));
  set("outline-tv", px(shape.outline.tv));
  set("depth-rest", `0 ${px(shape.depth.rest)} 0 var(--cc-ink)`);
  set("depth-pressed", `0 ${px(shape.depth.pressed)} 0 var(--cc-ink)`);
  set("depth-panel", `0 ${px(shape.depth.panel)} 0 var(--cc-ink)`);
  set("press-offset", px(shape.depth.pressOffset));
  for (const [name, radius] of Object.entries(shape.radius)) set(`radius-${name}`, px(radius));
  shape.space.forEach((space, i) => set(`space-${i + 1}`, px(space)));
  set("touch-min", px(shape.touchMin));
  set("focus-ring-width", px(shape.focusRing.width));
  set("focus-ring-offset", px(shape.focusRing.offset));
  set("tv-button-small", px(shape.tvButtonSmall));
  set("safe-tv", `${shape.safeTv * 100}%`);

  for (const [name, token] of Object.entries(tokens.motion)) {
    set(`motion-${kebab(name)}-duration`, `${token.ms}ms`);
    // squash, pop and wobble are keyframed effects, not CSS easings; the UI kit owns those.
    if (CSS_EASING.test(token.ease)) set(`motion-${kebab(name)}-ease`, token.ease);
  }

  return vars;
}

/** A stylesheet rule declaring every token as a CSS custom property: `:root { --cc-ink: #1E2A4A; … }`. */
export function toCssVars(tokens: Tokens = houseTokens, selector = ":root"): string {
  const lines = Object.entries(cssVarEntries(tokens)).map(
    ([name, value]) => `  ${name}: ${value};`,
  );
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}

/** `#1E2A4A` becomes `0x1E2A4A`, the number Phaser takes for tints, fills and strokes. */
export function toPhaserColor(hex: Hex): number {
  if (!HEX.test(hex)) throw new TypeError(`Not a #RRGGBB colour: ${hex}`);
  return Number.parseInt(hex.slice(1), 16);
}

/** Every named colour as a Phaser number: core colours, tints and players by id. */
export function toPhaserColors(tokens: Tokens = houseTokens) {
  const map = <K extends string>(record: Record<K, Hex>) =>
    Object.fromEntries(
      Object.entries<Hex>(record).map(([name, hex]) => [name, toPhaserColor(hex)]),
    ) as Record<K, number>;
  const players = Object.fromEntries(
    tokens.players.map((player) => [player.id, toPhaserColor(player.color)]),
  ) as Record<Tokens["players"][number]["id"], number>;
  return { color: map(tokens.color), tint: map(tokens.tint), players } as const;
}
