import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface ScanOptions {
  /** Repo-root-relative directories to walk (may be nested, e.g. "games/quick-draw/src/shared"). */
  dirs: readonly string[];
  /** File extensions to collect, each including the leading dot, e.g. [".vue", ".ts"]. */
  extensions: readonly string[];
}

/** Directories a style scan never descends into: build output, caches, dependencies. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".wrangler",
  "coverage",
  "playwright-report",
  "test-results",
  ".git",
]);

/** Every file under `rootDir`'s `dirs` whose name ends with one of `extensions`, repo-relative, sorted. */
export function scanFiles(rootDir: string, { dirs, extensions }: ScanOptions): string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // the folder doesn't exist (e.g. no games/ yet in a minimal fixture) - nothing to scan
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(relative(rootDir, join(dir, entry.name)).split(sep).join("/"));
      }
    }
  };

  for (const dir of dirs) walk(join(rootDir, dir));
  return files.toSorted();
}

/** Every game's `src/shared/` folder under `games/*`, matching `extensions`. Repo-relative, sorted. */
export function scanGamesShared(rootDir: string, extensions: readonly string[]): string[] {
  let gameIds: string[];
  try {
    gameIds = readdirSync(join(rootDir, "games"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return []; // no games/ yet
  }
  const dirs = gameIds.toSorted().map((id) => `games/${id}/src/shared`);
  return scanFiles(rootDir, { dirs, extensions });
}
