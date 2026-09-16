/**
 * Scene palettes, registered from every `<game-id>.ts` file in this folder. Adding a game adds a
 * file here and never edits a shared list (docs/architecture/platform.md).
 *
 * The registry uses Vite's `import.meta.glob`, so import this module from Vite-built code or
 * Vitest only. The root `@couchcade/theme` export doesn't include it and stays plain TypeScript.
 */
import { color, world } from "../tokens.ts";
import type { Hex, ScenePalette, ScenePaletteId } from "../tokens.ts";

export interface RegisteredScenePalette extends ScenePalette {
  /** The game that owns the palette: its file name. */
  readonly game: string;
  /** Core colours plus the scene colours, without duplicates. What the game's pixel art may use. */
  readonly world: readonly Hex[];
}

const HEX = /^#[0-9A-F]{6}$/;

/**
 * Builds the registry from `{ "./<game-id>.ts": palette }` modules. Throws on a malformed colour,
 * a duplicate scene id, or a world palette above `world.maxColors`.
 */
export function registerScenePalettes(
  modules: Record<string, ScenePalette>,
): readonly RegisteredScenePalette[] {
  const seen = new Map<ScenePaletteId, string>();
  const core = Object.values<Hex>(color);

  return Object.entries(modules)
    .map(([path, palette]) => {
      const game = path.replace(/^.*\//, "").replace(/\.ts$/, "");
      const bad = palette.colors.find((hex) => !HEX.test(hex));
      if (bad) throw new TypeError(`Scene ${palette.id} (${game}): ${bad} is not #RRGGBB`);

      const owner = seen.get(palette.id);
      if (owner) throw new Error(`Scene id ${palette.id} is used by both ${owner} and ${game}`);
      seen.set(palette.id, game);

      const worldColors = [...new Set([...core, ...palette.colors])];
      if (worldColors.length > world.maxColors) {
        throw new RangeError(
          `Scene ${palette.id} (${game}) has ${worldColors.length} colours with core; the cap is ${world.maxColors}`,
        );
      }
      return { id: palette.id, colors: palette.colors, game, world: worldColors };
    })
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

/** Every registered scene palette, sorted by scene id. */
export const scenePalettes = registerScenePalettes(
  import.meta.glob<ScenePalette>(["./*.ts", "!./index.ts"], { eager: true, import: "default" }),
);

/** Scene colours by scene id, as in HOUSE_STYLE: `scenes.desert` is `["#F1CF8B", …]`. */
export const scenes: Readonly<Record<ScenePaletteId, readonly Hex[]>> = Object.fromEntries(
  scenePalettes.map((palette) => [palette.id, palette.colors]),
);

/** The registered palette for a scene id. Throws for an unknown id. */
export function getScenePalette(id: ScenePaletteId): RegisteredScenePalette {
  const palette = scenePalettes.find((candidate) => candidate.id === id);
  if (!palette) throw new RangeError(`Unknown scene palette: ${id}`);
  return palette;
}
