/**
 * The auto-discovery registries (docs/architecture/platform.md, "Auto-discovery registry").
 *
 * Games plug in by existing in `games/<id>`. The apps own the `import.meta.glob` call, because a
 * package may not import from `games/` and Vite resolves a glob relative to the file that has it:
 *
 * ```ts
 * // apps/host: eager, the menu needs every title and player count without loading a game's rules
 * export const metaRegistry = createGameMetaRegistry(
 *   import.meta.glob("../../../../games/*\/src/meta.ts", { eager: true, import: "default" }),
 * );
 * // apps/host: lazy, the full game (physics included) loads once a room actually starts it
 * export const gameRegistry = createLazyGameRegistry(
 *   import.meta.glob("../../../../games/*\/src/index.ts", { import: "default" }),
 * );
 * // apps/controller: lazy, over each game's phone entry only
 * export const controllers = createControllerRegistry(
 *   import.meta.glob("../../../../games/*\/src/controller/index.ts", { import: "default" }),
 * );
 * ```
 *
 * Nobody edits a list of games. With no games yet a glob is `{}` and its registry is empty.
 * Phones never load a game's `src/index.ts`, so physics and host-only shared code stay off them
 * (owner decision, 16 September 2026). The host's own platform bundle doesn't load it either until
 * a room starts that game, for the same reason (CC-3.25): a game's rules can be as heavy as they
 * need (Planck.js and friends) without inflating the shared platform bundle every game pays for.
 */
import {
  checkControllerDefinition,
  checkGameDefinition,
  checkGameMeta,
} from "../contract/index.ts";
import type { CouchcadeController, CouchcadeGame, GameMeta } from "../contract/index.ts";

export interface GameMetaRegistry {
  /** Every non-hidden game's metadata, sorted by title. */
  readonly games: readonly GameMeta[];
  has(id: string): boolean;
  /** The metadata for this id, or undefined for an unknown or hidden id. Loads nothing. */
  get(id: string): GameMeta | undefined;
}

export interface LazyGameRegistry {
  /** The id of every game (hidden included), from its folder name, sorted. Loads nothing. */
  readonly ids: readonly string[];
  has(id: string): boolean;
  /**
   * Loads the full game for this id, once. Rejects with `UnknownGameError` for an id no game
   * folder has, and with a `TypeError` when the entry is invalid or its id doesn't match its
   * folder. A failed load isn't cached, so a dropped chunk can be retried. Doesn't itself check
   * `hidden` — callers reach a game id through `GameMetaRegistry`, which already leaves hidden
   * games out, so nothing offers one to load in the first place.
   */
  load(id: string): Promise<CouchcadeGame>;
}

export interface ControllerRegistry {
  /** The id of every game with a phone entry, from its folder name, sorted. Loads nothing. */
  readonly ids: readonly string[];
  has(id: string): boolean;
  /**
   * Loads the phone entry for this id, once. Rejects with `UnknownGameError` for an id no game
   * folder has, and with a `TypeError` when the entry is invalid or its id doesn't match its
   * folder. A failed load isn't cached, so a dropped chunk can be retried.
   */
  load(id: string): Promise<CouchcadeController>;
}

/** Thrown for a game id the registry doesn't know, such as a game newer than this build. */
export class UnknownGameError extends Error {
  readonly gameId: string;

  constructor(gameId: string) {
    super(`No game with id ${gameId} in this build`);
    this.name = "UnknownGameError";
    this.gameId = gameId;
  }
}

/**
 * The game id of a glob key: the folder that holds `src/`. `../../games/quick-draw/src/index.ts`
 * and `../../games/quick-draw/src/controller/index.ts` both give `quick-draw`.
 */
export function gameIdOf(path: string): string {
  const segments = path.split("/");
  const src = segments.lastIndexOf("src");
  const folder = src > 0 ? segments[src - 1] : undefined;
  if (folder === undefined || folder === "." || folder === ".." || src === segments.length - 1) {
    throw new Error(`Registry entry ${path} is not a file under <game-id>/src/`);
  }
  return folder;
}

/** Maps glob keys to game ids. Throws when two keys belong to folders with the same name. */
function pathsById(paths: readonly string[]): Map<string, string> {
  const byId = new Map<string, string>();
  for (const path of paths) {
    const id = gameIdOf(path);
    const other = byId.get(id);
    if (other !== undefined) throw new Error(`Game id ${id} is used by both ${other} and ${path}`);
    byId.set(id, path);
  }
  return byId;
}

/** Throws unless the entry has no problems and its id equals its folder name. */
function expectEntry(path: string, id: string, entry: unknown, problems: string[]): void {
  if (problems.length > 0) {
    throw new TypeError(`Entry ${path} is invalid: ${problems.join("; ")}`);
  }
  const entryId = (entry as { id: string }).id;
  if (entryId !== id) {
    throw new TypeError(`Entry ${path} has id ${entryId}, but its folder is ${id}`);
  }
}

/**
 * Builds the eager metadata registry from `{ "<...>/<id>/src/meta.ts": meta }`. Throws when an
 * entry isn't a valid `GameMeta` (see `checkGameMeta`), when an id doesn't match its folder, or
 * when two games share an id. A game with `hidden: true` is checked the same way but left out, so
 * an unfinished game is never on the menu and can't be started.
 */
export function createGameMetaRegistry(
  modules: Readonly<Record<string, unknown>>,
): GameMetaRegistry {
  const games = [...pathsById(Object.keys(modules))]
    .map(([id, path]) => {
      const meta = modules[path];
      expectEntry(path, id, meta, checkGameMeta(meta));
      return meta as GameMeta;
    })
    .filter((meta) => meta.hidden !== true)
    .toSorted((a, b) => a.title.localeCompare(b.title, "en") || a.id.localeCompare(b.id, "en"));
  const byId = new Map(games.map((meta) => [meta.id, meta]));

  return {
    games,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
  };
}

/**
 * A registry over a lazy glob, loaded once per id and cached. Shared by `createLazyGameRegistry`
 * and `createControllerRegistry`, which differ only in how they validate a loaded entry.
 */
function createLazyRegistry<T extends { id: string }>(
  loaders: Readonly<Record<string, () => Promise<unknown>>>,
  check: (entry: unknown) => string[],
): { ids: readonly string[]; has(id: string): boolean; load(id: string): Promise<T> } {
  const byId = pathsById(Object.keys(loaders));
  const ids = [...byId.keys()].toSorted((a, b) => a.localeCompare(b, "en"));
  const loading = new Map<string, Promise<T>>();

  return {
    ids,
    has: (id) => byId.has(id),
    load(id) {
      const path = byId.get(id);
      const loader = path === undefined ? undefined : loaders[path];
      if (path === undefined || loader === undefined) {
        return Promise.reject(new UnknownGameError(id));
      }
      let entry = loading.get(id);
      if (entry === undefined) {
        entry = loader().then((value) => {
          expectEntry(path, id, value, check(value));
          return value as T;
        });
        entry.catch(() => loading.delete(id));
        loading.set(id, entry);
      }
      return entry;
    },
  };
}

/**
 * Builds the lazy full-game registry from `{ "<...>/<id>/src/index.ts": () => import(...) }`. Ids
 * come from folder names, so nothing loads until `load(id)`. Throws when two entries share an id.
 */
export function createLazyGameRegistry(
  loaders: Readonly<Record<string, () => Promise<unknown>>>,
): LazyGameRegistry {
  return createLazyRegistry<CouchcadeGame>(loaders, checkGameDefinition);
}

/**
 * Builds the phone registry from a lazy glob:
 * `{ "<...>/<id>/src/controller/index.ts": () => import(...) }`. Ids come from folder names, so
 * nothing loads until `load(id)`. Throws when two entries share an id.
 */
export function createControllerRegistry(
  loaders: Readonly<Record<string, () => Promise<unknown>>>,
): ControllerRegistry {
  return createLazyRegistry<CouchcadeController>(loaders, checkControllerDefinition);
}
