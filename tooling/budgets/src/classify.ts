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
 * Classifies one app's build output into platform vs. per-game code, fonts, tracked vendor chunks
 * and matched lazy (dynamic-import) platform chunks, purely from what Rollup actually emitted — no
 * maintained list of games or file names.
 *
 * A chunk belongs to a game when Rollup split it from a module under `games/<id>/` (its
 * `facadeModuleId`, or the game's controller entry re-exported through a wrapper chunk still
 * carries that path). A chunk not a game's belongs to a `lazyChunks` matcher when its
 * `facadeModuleId` contains that matcher's `path`. Every other chunk is platform code: what a
 * phone or the TV loads before any game is chosen or any lazy screen opens. This is why the
 * per-game phone controller code (`games/<id>/src/controller/`) never inflates the platform
 * budget, why a game's TV scene never counts against the shared host platform budget, and why a
 * lazily-loaded platform screen (docs/architecture/pips.md's customiser: "a lazy chunk") is
 * measured on its own instead of folding into the initial-JS ceiling it never actually adds to.
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
    } else {
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
