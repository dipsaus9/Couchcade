import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { PaletteEntry } from "./color-distance.ts";
import { toPaletteEntries } from "./color-distance.ts";
import { WORLD_GRID, isOnWorldGrid } from "./grid.ts";
import { decodePng, pixelOffset } from "./png.ts";
import type { DecodedPng } from "./png.ts";
import { loadScenePaletteForGame } from "./scene-loader.ts";

export interface SpriteViolation {
  readonly kind: "off-palette" | "frame-size";
  readonly message: string;
}

export interface GameCheckResult {
  readonly game: string;
  /** Violations by sprite path (relative to the repo root). Empty when every sprite is clean. */
  readonly violations: ReadonlyMap<string, readonly SpriteViolation[]>;
}

const rgbToHexKey = (r: number, g: number, b: number): string =>
  `#${[r, g, b]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;

/**
 * Checks one decoded sprite against `palette` (core + scene colours) and the world grid:
 * - **off-palette**: any non-transparent pixel whose exact RGB isn't one of `palette`'s colours.
 *   `pnpm assets:recolour` guarantees this for its own output; this check catches a sprite that
 *   was never recoloured, or was hand-edited afterwards.
 * - **frame-size**: the sprite's own width/height aren't both a multiple of the world grid
 *   (see grid.ts). A sprite sheet's individual frames aren't introspected here — only the file's
 *   own pixel dimensions — since the pipeline has no frame-size metadata format yet; a single
 *   sprite's dimensions are its one frame.
 */
export function checkSpriteImage(
  image: DecodedPng,
  palette: readonly PaletteEntry[],
): SpriteViolation[] {
  const violations: SpriteViolation[] = [];

  if (!isOnWorldGrid(image.width, image.height)) {
    violations.push({
      kind: "frame-size",
      message:
        `${image.width}x${image.height} isn't a multiple of the world grid ` +
        `(${WORLD_GRID.width}x${WORLD_GRID.height})`,
    });
  }

  const allowed = new Set<string>(palette.map((entry) => entry.hex));
  const offPalette = new Set<string>();
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = pixelOffset(image.width, x, y);
      if (image.data[offset + 3] === 0) continue; // fully transparent: no colour to check
      const hex = rgbToHexKey(
        image.data[offset]!,
        image.data[offset + 1]!,
        image.data[offset + 2]!,
      );
      if (!allowed.has(hex)) offPalette.add(hex);
    }
  }
  if (offPalette.size > 0) {
    const sample = [...offPalette].slice(0, 5).join(", ");
    violations.push({
      kind: "off-palette",
      message: `${offPalette.size} off-palette colour(s), e.g. ${sample}`,
    });
  }

  return violations;
}

function findPngFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".png"))
    .map((entry) => join(dir, entry))
    .toSorted();
}

/**
 * Checks every PNG under `games/<gameId>/assets/`. A game with no `assets/` folder (or an empty
 * one) has nothing to check and returns no violations — it hasn't shipped any sprites yet.
 */
export async function checkGameAssets(gameId: string, repoRoot: string): Promise<GameCheckResult> {
  const assetsDir = join(repoRoot, "games", gameId, "assets");
  const files = findPngFiles(assetsDir);
  const violations = new Map<string, readonly SpriteViolation[]>();
  if (files.length === 0) return { game: gameId, violations };

  const scene = await loadScenePaletteForGame(gameId, repoRoot);
  if (!scene) {
    violations.set(relative(repoRoot, assetsDir), [
      {
        kind: "off-palette",
        message: `no scene palette registered for game "${gameId}" (expected packages/theme/src/scenes/${gameId}.ts)`,
      },
    ]);
    return { game: gameId, violations };
  }
  const palette = toPaletteEntries(scene.world);

  for (const file of files) {
    const image = decodePng(await readFile(file));
    const fileViolations = checkSpriteImage(image, palette);
    if (fileViolations.length > 0) violations.set(relative(repoRoot, file), fileViolations);
  }
  return { game: gameId, violations };
}

/** Checks every game's assets under `games/`. Games without a folder yet are skipped. */
export async function checkAllGameAssets(repoRoot: string): Promise<readonly GameCheckResult[]> {
  const gamesDir = join(repoRoot, "games");
  if (!existsSync(gamesDir)) return [];
  const gameIds = readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  const results: GameCheckResult[] = [];
  for (const gameId of gameIds) results.push(await checkGameAssets(gameId, repoRoot));
  return results;
}

export function hasViolations(results: readonly GameCheckResult[]): boolean {
  return results.some((result) => result.violations.size > 0);
}

/** A human-readable report for the CLI/CI log. */
export function formatCheckReport(results: readonly GameCheckResult[]): string {
  const lines: string[] = [];
  for (const result of results) {
    for (const [file, violations] of result.violations) {
      for (const violation of violations)
        lines.push(`${file}: ${violation.kind}: ${violation.message}`);
    }
  }
  if (lines.length === 0)
    return "check-sprites: every sprite is on-palette and on the world grid\n";
  return `${lines.join("\n")}\n\ncheck-sprites: ${lines.length} violation(s)\n`;
}
