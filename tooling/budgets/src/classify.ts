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

export interface AppMeasurements {
  /** Gzip size of every chunk that isn't a game's own code: what loads before a game is picked. */
  platformGzipBytes: number;
  /** Gzip size per game id, summed over every chunk Rollup split from that game's own folder. */
  perGame: Map<string, number>;
  /** Raw (already-compressed) size of every `.woff2` asset the build emits. */
  fontsRawBytes: number;
  /** Gzip size per tracked vendor (e.g. `"phaser"`), summed over chunks built from its modules. */
  vendorGzipBytes: Map<string, number>;
}

/**
 * Classifies one app's build output into platform vs. per-game code, fonts and tracked vendor
 * chunks, purely from what Rollup actually emitted — no maintained list of games or file names.
 *
 * A chunk belongs to a game when Rollup split it from a module under `games/<id>/` (its
 * `facadeModuleId`, or the game's controller entry re-exported through a wrapper chunk still
 * carries that path). Every other chunk is platform code: what a phone or the TV loads before any
 * game is chosen. This is why the per-game phone controller code (`games/<id>/src/controller/`)
 * never inflates the platform budget, and why a game's TV scene never counts against the shared
 * host platform budget either — each is measured on its own.
 */
export function measureApp(
  items: readonly BuiltItem[],
  vendors: readonly string[],
): AppMeasurements {
  const perGame = new Map<string, number>();
  const vendorGzipBytes = new Map<string, number>(vendors.map((v) => [v, 0]));
  let platformGzipBytes = 0;
  let fontsRawBytes = 0;

  for (const item of items) {
    if (item.type === "asset") {
      if (item.fileName.endsWith(".woff2")) fontsRawBytes += rawSize(item.source);
      continue;
    }

    const size = gzipSize(item.code);
    const gameMatch = item.facadeModuleId ? GAME_PATH.exec(item.facadeModuleId) : null;

    if (gameMatch) {
      const gameId = gameMatch[1] as string;
      perGame.set(gameId, (perGame.get(gameId) ?? 0) + size);
    } else {
      platformGzipBytes += size;
    }

    for (const vendor of vendors) {
      if (item.moduleIds.some((id) => belongsToVendor(id, vendor))) {
        vendorGzipBytes.set(vendor, (vendorGzipBytes.get(vendor) ?? 0) + size);
      }
    }
  }

  return { platformGzipBytes, perGame, fontsRawBytes, vendorGzipBytes };
}
