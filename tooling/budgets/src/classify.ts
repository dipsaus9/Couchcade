import { gzipSize, rawSize } from "./size.ts";

/** A built JS chunk, shaped like Rollup's `OutputChunk` (see `buildApp` in budgets.ts). */
export interface BuiltChunk {
  type: "chunk";
  fileName: string;
  /** The module Rollup split this chunk from, or `null` for a shared/vendor chunk. */
  facadeModuleId: string | null;
  /** Every module this chunk's code was bundled from, absolute paths. */
  moduleIds: readonly string[];
  code: string;
  /**
   * Other chunks (by `fileName`) this chunk statically imports. Optional: a fixture built without
   * it (or a build API that doesn't expose it) is treated as having none, which only ever widens
   * what counts as platform code, never narrows it — see `isSharedGameChunk`.
   */
  imports?: readonly string[];
  /** Other chunks (by `fileName`) this chunk reaches through a dynamic `import()`. */
  dynamicImports?: readonly string[];
}

/** A built static asset (font, CSS, …), shaped like Rollup's `OutputAsset`. */
export interface BuiltAsset {
  type: "asset";
  fileName: string;
  source: string | Uint8Array;
}

export type BuiltItem = BuiltChunk | BuiltAsset;

/** Matches an absolute module path that lives under a game's own folder. */
const GAME_PATH = /\/games\/([^/]+)\//;

/** Matches an absolute module path resolved into a given npm package inside node_modules. */
function belongsToVendor(moduleId: string, vendor: string): boolean {
  return new RegExp(`/node_modules/(\\.pnpm/${vendor}@[^/]+/node_modules/)?${vendor}/`).test(
    moduleId,
  );
}

/** A platform chunk that only loads on demand (a dynamic `import()`), matched by its facade module path. */
export interface LazyChunkMatcher {
  name: string;
  /** A substring of the chunk's `facadeModuleId` (repo-relative folder is enough, e.g. `"apps/controller/src/pips/"`). */
  path: string;
}

export interface AppMeasurements {
  /**
   * Gzip size of every chunk that is neither a game's own code nor a matched lazy chunk: what a
   * phone or the TV loads before any game is chosen or any lazy platform screen opens.
   */
  platformGzipBytes: number;
  /** Gzip size per game id, summed over every chunk Rollup split from that game's own folder. */
  perGame: Map<string, number>;
  /** Raw (already-compressed) size of every `.woff2` asset the build emits. */
  fontsRawBytes: number;
  /** Gzip size per tracked vendor (e.g. `"phaser"`), summed over chunks built from its modules. */
  vendorGzipBytes: Map<string, number>;
  /**
   * Gzip size per matched `LazyChunkMatcher` name, summed over the chunks Rollup split for it.
   * These chunks are excluded from `platformGzipBytes`: a dynamic `import()` never loads before
   * the screen it belongs to is opened, so it never inflates what a phone downloads up front.
   */
  lazyGzipBytes: Map<string, number>;
}

/**
 * True for a shared chunk (no facade module of its own — `belongsToVendor`'s "vendor chunk") that
 * every chunk importing it (statically or dynamically, one hop) is itself a game's own chunk: code
 * two or more games' lazily-loaded entries share, such as `@couchcade/physics` once more than one
 * game depends on it. Rollup then splits it into its own chunk instead of duplicating it into each
 * game's, and that shared chunk is *only* ever reached by first loading one of those games' own
 * dynamic `import()`, so — like each game's own code — it never loads before a game is chosen.
 *
 * This is deliberately a one-hop, immediate-importers check, not general "is this eventually only
 * reached through a dynamic import" reachability: the platform bootstrap here (`apps/host`'s own
 * boot sequence) *also* code-splits through a dynamic `import()` it calls unconditionally at
 * startup (`stage/boot.ts`), so a chunk shared only between platform-eager chunks like that must
 * stay counted as platform — a deeper reachability walk can't tell "eager, just chunked for
 * caching" apart from "deferred behind a game being chosen" from the chunk graph alone. Checking
 * only the *immediate* importers' own `facadeModuleId` sidesteps that: it only exempts a chunk
 * whose sole reachers are themselves already-recognised game entries (`GAME_PATH`), which is
 * exactly the shape a game's own `src/index.ts` and its lazily-loaded dependencies take.
 */
function isSharedGameChunk(
  item: BuiltChunk,
  importedBy: ReadonlyMap<string, readonly string[]>,
  byFileName: ReadonlyMap<string, BuiltChunk>,
): boolean {
  if (item.facadeModuleId !== null) return false;
  const importers = importedBy.get(item.fileName);
  if (importers === undefined || importers.length === 0) return false;
  return importers.every((name) => {
    const importer = byFileName.get(name);
    return (
      importer !== undefined &&
      importer.facadeModuleId !== null &&
      GAME_PATH.test(importer.facadeModuleId)
    );
  });
}

/** Maps every chunk's `fileName` to the `fileName`s of the chunks that import it, one hop. */
function buildImportedByMap(chunks: readonly BuiltChunk[]): Map<string, string[]> {
  const importedBy = new Map<string, string[]>();
  for (const chunk of chunks) {
    for (const dep of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
      const importers = importedBy.get(dep);
      if (importers) importers.push(chunk.fileName);
      else importedBy.set(dep, [chunk.fileName]);
    }
  }
  return importedBy;
}

/**
 * Classifies one app's build output into platform vs. per-game code, fonts, tracked vendor chunks
 * and matched lazy (dynamic-import) platform chunks, purely from what Rollup actually emitted — no
 * maintained list of games or file names.
 *
 * A chunk belongs to a game when Rollup split it from a module under `games/<id>/` (its
 * `facadeModuleId`, or the game's controller entry re-exported through a wrapper chunk still
 * carries that path). A chunk not a game's belongs to a `lazyChunks` matcher when its
 * `facadeModuleId` contains that matcher's `path`. A chunk with no facade module of its own that
 * only games' chunks import is a `isSharedGameChunk` — code two or more games share, counted
 * nowhere (not any one game's budget, since it isn't duplicated into either; not platform, since
 * it never loads before a game is chosen). Every other chunk is platform code: what a phone or the
 * TV loads before any game is chosen or any lazy screen opens. This is why the per-game phone
 * controller code (`games/<id>/src/controller/`) never inflates the platform budget, why a game's
 * TV scene never counts against the shared host platform budget, and why a lazily-loaded platform
 * screen (docs/architecture/pips.md's customiser: "a lazy chunk") is measured on its own instead
 * of folding into the initial-JS ceiling it never actually adds to.
 */
export function measureApp(
  items: readonly BuiltItem[],
  vendors: readonly string[],
  lazyChunks: readonly LazyChunkMatcher[] = [],
): AppMeasurements {
  const perGame = new Map<string, number>();
  const vendorGzipBytes = new Map<string, number>(vendors.map((v) => [v, 0]));
  const lazyGzipBytes = new Map<string, number>(lazyChunks.map((l) => [l.name, 0]));
  let platformGzipBytes = 0;
  let fontsRawBytes = 0;

  const chunks = items.filter((item): item is BuiltChunk => item.type === "chunk");
  const importedBy = buildImportedByMap(chunks);
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));

  for (const item of items) {
    if (item.type === "asset") {
      if (item.fileName.endsWith(".woff2")) fontsRawBytes += rawSize(item.source);
      continue;
    }

    const size = gzipSize(item.code);
    const gameMatch = item.facadeModuleId ? GAME_PATH.exec(item.facadeModuleId) : null;
    const lazyMatch = item.facadeModuleId
      ? lazyChunks.find((l) => item.facadeModuleId?.includes(l.path))
      : undefined;

    if (gameMatch) {
      const gameId = gameMatch[1] as string;
      perGame.set(gameId, (perGame.get(gameId) ?? 0) + size);
    } else if (lazyMatch) {
      lazyGzipBytes.set(lazyMatch.name, (lazyGzipBytes.get(lazyMatch.name) ?? 0) + size);
    } else if (!isSharedGameChunk(item, importedBy, byFileName)) {
      platformGzipBytes += size;
    }

    for (const vendor of vendors) {
      if (item.moduleIds.some((id) => belongsToVendor(id, vendor))) {
        vendorGzipBytes.set(vendor, (vendorGzipBytes.get(vendor) ?? 0) + size);
      }
    }
  }

  return { platformGzipBytes, perGame, fontsRawBytes, vendorGzipBytes, lazyGzipBytes };
}
