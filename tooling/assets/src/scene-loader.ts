import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { color, world } from "@couchcade/theme";
import type { Hex, ScenePalette, ScenePaletteId } from "@couchcade/theme";

/**
 * A resolved scene palette: the game file that owns it, its own colours, and the full "world"
 * palette (core colours plus the scene's, deduplicated) that its sprites may use.
 */
export interface LoadedScenePalette {
  readonly id: ScenePaletteId;
  /** The scene file's name, without `.ts` (by convention the game id it belongs to). */
  readonly game: string;
  readonly colors: readonly Hex[];
  readonly world: readonly Hex[];
}

const HEX = /^#[0-9A-F]{6}$/;

/** Where every game registers its scene palette (docs/architecture/platform.md). */
export function scenesDir(repoRoot: string): string {
  return join(repoRoot, "packages/theme/src/scenes");
}

/**
 * Loads every `packages/theme/src/scenes/<game-id>.ts` file and validates it the same way
 * `packages/theme/src/scenes/index.ts` (`registerScenePalettes`) does: no malformed `#RRGGBB`
 * colours, no two files sharing a scene id, and core + scene colours within `world.maxColors`.
 *
 * That registry module registers itself with Vite's `import.meta.glob(["./*.ts", ...])`, which is
 * a build-time macro Vite/Vitest rewrite into a static import map; it doesn't exist as a runtime
 * function, so evaluating that module under plain `node` throws. This CLI runs under plain `node`
 * (matching every other `tooling/*` package, e.g. `tooling/check-deps`), so instead of importing
 * that module it reads the same folder itself with `readdirSync` and dynamically `import()`s each
 * file by its filesystem URL. Both approaches build the identical registry from the identical
 * files; only the mechanism used to discover the files differs.
 */
export async function loadSceneRegistry(repoRoot: string): Promise<readonly LoadedScenePalette[]> {
  const dir = scenesDir(repoRoot);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts") && name !== "index.ts");
  const core = Object.values<Hex>(color);
  const seen = new Map<ScenePaletteId, string>();

  const entries: LoadedScenePalette[] = [];
  for (const file of files) {
    const game = file.replace(/\.ts$/, "");
    const module = (await import(pathToFileURL(join(dir, file)).href)) as { default: ScenePalette };
    const palette = module.default;

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
    entries.push({ id: palette.id, game, colors: palette.colors, world: worldColors });
  }
  return entries.toSorted((a, b) => a.id.localeCompare(b.id));
}

/** The registered palette for a scene id (e.g. `desert`). Throws for an unknown id. */
export async function loadScenePalette(
  sceneId: string,
  repoRoot: string,
): Promise<LoadedScenePalette> {
  const registry = await loadSceneRegistry(repoRoot);
  const palette = registry.find((candidate) => candidate.id === sceneId);
  if (!palette) {
    const known = registry.map((entry) => entry.id).join(", ") || "(none registered)";
    throw new RangeError(`Unknown scene palette "${sceneId}". Known scenes: ${known}`);
  }
  return palette;
}

/** The registered palette for a game id (its scene file's name, e.g. `quick-draw`). */
export async function loadScenePaletteForGame(
  gameId: string,
  repoRoot: string,
): Promise<LoadedScenePalette | undefined> {
  const registry = await loadSceneRegistry(repoRoot);
  return registry.find((candidate) => candidate.game === gameId);
}
